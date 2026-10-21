from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints, model_validator

from app.models.enums import Role
from app.schemas.common import APIModel

COMMON_PASSWORDS = {
    "password123",
    "password1234",
    "qwertyuiop",
    "1234567890",
    "iloveyou12",
    "letmein1234",
    "welcome1234",
    "admin12345",
    "abc1234567",
    "passw0rd123",
}


def _check_password(value: str) -> str:
    if value.isdigit():
        raise ValueError("Password can't be only numbers")
    if value.lower() in COMMON_PASSWORDS:
        raise ValueError("This password is too common")
    if len(set(value)) < 4:
        raise ValueError("Password needs more variety")
    return value


Password = Annotated[str, Field(min_length=10, max_length=128), AfterValidator(_check_password)]
Phone = Annotated[str, StringConstraints(pattern=r"^\+[1-9]\d{7,14}$")]  # E.164, e.g. +919876543210
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]


def normalise_email(value: str) -> str:
    return value.strip().lower()


Email = Annotated[EmailStr, AfterValidator(normalise_email)]


class SignupRequest(APIModel):
    name: PersonName
    email: Email
    password: Password
    # Only these two roles can be self-selected. Admins are created by a CLI script.
    account_type: Literal["customer", "owner"] = "customer"
    phone: Phone | None = None
    business_name: str | None = Field(None, max_length=120)

    @model_validator(mode="after")
    def password_not_personal(self) -> "SignupRequest":
        lowered = self.password.lower()
        if self.email.split("@")[0] in lowered or self.name.lower().replace(" ", "") in lowered:
            raise ValueError("Password must not contain your name or email")
        return self


class LoginRequest(APIModel):
    email: Email
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(APIModel):
    email: Email


class ResetPasswordRequest(APIModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: Password


class VerifyEmailRequest(APIModel):
    token: str = Field(min_length=20, max_length=200)


class ChangePasswordRequest(APIModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: Password


class Preferences(BaseModel):
    destinations: list[str] = Field(default_factory=list, max_length=20)
    newsletter: bool = False


class OwnerProfile(BaseModel):
    business_name: str | None = Field(None, max_length=120)
    gstin: str | None = Field(None, pattern=r"^[0-9A-Z]{15}$")


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    phone: str | None = None
    role: Role
    email_verified: bool
    preferences: Preferences = Preferences()
    owner_profile: OwnerProfile | None = None
    created_at: datetime | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class ProfileUpdate(APIModel):
    name: PersonName | None = None
    phone: Phone | None = None
    preferences: Preferences | None = None
    owner_profile: OwnerProfile | None = None


class SessionOut(BaseModel):
    id: str
    created_at: datetime
    last_used_at: datetime | None = None
    user_agent: str | None = None
    current: bool = False
