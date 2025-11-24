from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class InfringementCreate(BaseModel):
    kart_number: int
    turn_number: Optional[int] = None
    description: str
    observer: Optional[str] = None
    performed_by: str
    # Optional future fields
    penalty_due: Optional[str] = None
    penalty_description: Optional[str] = None


class ApplyPenaltyRequest(BaseModel):
    performed_by: str

class InfringementResponse(BaseModel):
    id: int
    kart_number: int
    turn_number: Optional[int]
    description: str
    observer: Optional[str]
    warning_count: int
    penalty_due: str
    penalty_description: str
    penalty_taken: Optional[datetime]
    timestamp: datetime

    class Config:
        orm_mode = True

class InfringementHistoryResponse(BaseModel):
    id: int
    infringement_id: int
    action: str
    performed_by: str
    observer: Optional[str]
    details: Optional[str]
    timestamp: datetime

    class Config:
        orm_mode = True

class ApplyPenaltyResponse(BaseModel):
    kart_number: int
    status: str
    infringement_id: Optional[int] = None
    penalty_description: Optional[str] = None
