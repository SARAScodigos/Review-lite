from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.schemas.auth_schema import (
    AuthenticatedUserResponse,
    LoginRequest,
    LoginResponse,
)
from app.config import settings
from app.security import (
    authenticate_user,
    create_access_token,
    require_authenticated_user,
    SESSION_COOKIE_NAME,
)


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
def login(credentials: LoginRequest, response: Response) -> LoginResponse:
    if not authenticate_user(credentials.username, credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expires_in = settings.AUTH_TOKEN_EXPIRE_MINUTES * 60
    access_token = create_access_token(credentials.username)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=access_token,
        max_age=expires_in,
        httponly=True,
        secure=False,
        samesite="strict",
        path="/",
    )
    return LoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        username=credentials.username,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    _username: str = Depends(require_authenticated_user),
) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=False,
        samesite="strict",
        path="/",
    )


@router.get("/me", response_model=AuthenticatedUserResponse)
def get_current_user(
    username: str = Depends(require_authenticated_user),
) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse(username=username)
