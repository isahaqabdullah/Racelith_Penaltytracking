from datetime import datetime, timezone, timedelta
from typing import Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator

class InfringementCreate(BaseModel):
    kart_number: int = Field(ge=1, le=2147483647)
    turn_number: Optional[Union[int, str]] = None
    description: Optional[str] = Field(default=None, max_length=2000)
    observer: Optional[str] = Field(default=None, max_length=200)
    performed_by: Optional[str] = Field(default=None, max_length=200)
    timestamp: Optional[datetime] = None
    penalty_description: Optional[str] = Field(default=None, max_length=500)
    session_name: Optional[str] = Field(default=None, max_length=59)
    request_id: Optional[str] = Field(default=None, min_length=8, max_length=100)

    @field_validator('timestamp')
    @classmethod
    def validate_time(cls, value):
        if value is None:
            return value
        value = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        if value > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError('Incident time cannot be more than five minutes in the future')
        return value

    @field_validator('turn_number')
    @classmethod
    def validate_turn(cls, value):
        if value is None:
            return None
        value = str(value).strip()
        if len(value) > 100:
            raise ValueError('Turn number must be at most 100 characters')
        return value or None

class ApplyPenaltyRequest(BaseModel):
    performed_by: str = Field(min_length=1, max_length=200)

class InfringementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kart_number: int
    turn_number: Optional[str]
    description: Optional[str]
    observer: Optional[str]
    warning_count: int
    penalty_due: str
    penalty_description: Optional[str]
    penalty_taken: Optional[datetime]
    timestamp: datetime
    session_name: Optional[str] = None
    penalty_origin: Optional[str] = None
    review_required: bool = False

class InfringementHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    infringement_id: int
    kart_number: Optional[int] = None
    action: str
    performed_by: str
    observer: Optional[str]
    details: Optional[str]
    timestamp: datetime

class ApplyPenaltyResponse(BaseModel):
    kart_number: int
    status: str
    infringement_id: Optional[int] = None
    penalty_description: Optional[str] = None
