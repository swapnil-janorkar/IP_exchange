from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User, UserRole
from app.core.audit_models import AuditLog
from app.core.database import get_db
from app.documents.storage import (
    InvalidDocumentError,
    UploadTooLargeError,
    save_upload,
)
from app.patents.exchange_models import Deal, Document, DocumentType
from app.patents.models import Patent

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    doc_type: DocumentType = Form(...),
    patent_id: str | None = Form(default=None),
    deal_id: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Convert optional form fields to integers, treating empty strings as None.
    try:
        patent_id = int(patent_id) if patent_id and patent_id.strip() else None
        deal_id = int(deal_id) if deal_id and deal_id.strip() else None
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="patent_id and deal_id must be valid integers.",
        ) from exc

    if patent_id is not None and patent_id <= 0:
        raise HTTPException(400, "patent_id must be a positive integer.")

    if deal_id is not None and deal_id <= 0:
        raise HTTPException(400, "deal_id must be a positive integer.")

    if patent_id is not None and deal_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Specify either patent_id or deal_id, not both.",
        )

    if patent_id is not None:
        patent = await db.get(Patent, patent_id)

        if patent is None:
            raise HTTPException(404, "Patent not found.")

        if patent.owner_id != user.id and user.role != UserRole.ADMIN:
            raise HTTPException(
                403,
                "You cannot attach a document to this patent.",
            )

    if deal_id is not None:
        deal = await db.get(Deal, deal_id)

        if deal is None:
            raise HTTPException(404, "Deal not found.")

        if (
            user.id not in {deal.seller_id, deal.buyer_id}
            and user.role != UserRole.ADMIN
        ):
            raise HTTPException(
                403,
                "You cannot attach a document to this deal.",
            )

    saved_path = None

    try:
        (
            storage_key,
            mime_type,
            size_bytes,
            saved_path,
            original_filename,
        ) = await save_upload(file)

        document = Document(
            owner_id=user.id,
            patent_id=patent_id,
            deal_id=deal_id,
            doc_type=doc_type,
            file_name=original_filename,
            storage_url=storage_key,
            mime_type=mime_type,
            size_bytes=size_bytes,
        )

        db.add(document)
        await db.flush()  # Generate document.id before creating the audit entry.

        ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        audit = AuditLog(
    actor_id=user.id,
    resource_type="document",
    resource_id=document.id,
    action="upload",
    outcome="success",
    detail="Document uploaded successfully",
    ip_address=ip,
    user_agent=user_agent,
)

        db.add(audit)
        await db.flush()

        await db.commit()

        await db.refresh(document)

        return {
            "id": document.id,
            "file_name": document.file_name,
            "doc_type": document.doc_type.value,
            "mime_type": document.mime_type,
            "size_bytes": document.size_bytes,
            "created_at": document.created_at,
        }

    except UploadTooLargeError as exc:
        raise HTTPException(413, str(exc)) from exc

    except InvalidDocumentError as exc:
        raise HTTPException(400, str(exc)) from exc

    except Exception:
        await db.rollback()

        if saved_path is not None:
            saved_path.unlink(missing_ok=True)

        raise

    finally:
        await file.close()
