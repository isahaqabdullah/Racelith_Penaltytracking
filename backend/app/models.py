from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime, timezone

Base = declarative_base()

# === Control DB Model ===
class SessionInfo(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)
    database_name = Column(String, unique=True, nullable=True)
    started_at = Column(DateTime(timezone=True))
    status = Column(String)  # "active" or "closed"

class AppConfig(Base):
    __tablename__ = "app_config"
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, index=True)
    value = Column(String)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

# === Per-session DB Models ===
class Infringement(Base):
    __tablename__ = "infringements"
    id = Column(Integer, primary_key=True, index=True)
    session_name = Column(String, index=True)
    kart_number = Column(Integer, index=True)
    turn_number = Column(String, nullable=True)
    description = Column(String)
    observer = Column(String, nullable=True)
    warning_count = Column(Integer, default=0)
    penalty_due = Column(String, default="No")  # "Yes" or "No"
    penalty_description = Column(String, default="Warning")
    penalty_taken = Column(DateTime(timezone=True), nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    requested_penalty = Column(String, nullable=True)
    penalty_origin = Column(String, nullable=True)
    review_required = Column(Boolean, default=False, nullable=False)
    request_id = Column(String, unique=True, nullable=True)
    request_fingerprint = Column(String, nullable=True)
    history = relationship(
        "InfringementHistory",
        back_populates="infringement",
        cascade="save-update, merge"
    )

class InfringementHistory(Base):
    __tablename__ = "infringement_history"
    id = Column(Integer, primary_key=True, index=True)
    session_name = Column(String, index=True)
    infringement_id = Column(Integer, ForeignKey("infringements.id", ondelete="CASCADE"))
    kart_number = Column(Integer, index=True)
    action = Column(String)
    performed_by = Column(String)
    observer = Column(String, nullable=True)
    details = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    infringement = relationship("Infringement", back_populates="history")
