"""Request-bound connections; lifecycle locks prevent switching during writes."""
import os
import threading
import uuid
from urllib.parse import unquote
from fastapi import Header, HTTPException
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from .models import Base, SessionInfo, AppConfig

load_dotenv()
CONTROL_DB_URL = os.getenv('DATABASE_URL')
if not CONTROL_DB_URL:
    raise ValueError('DATABASE_URL is required')
# The installed driver is psycopg2; SQLAlchemy 2.1 defaults to psycopg3.
CONTROL_DB_URL = make_url(CONTROL_DB_URL).set(drivername='postgresql+psycopg2')
_control_engine = create_engine(CONTROL_DB_URL, pool_pre_ping=True, connect_args={'connect_timeout':5})
ControlSessionLocal = sessionmaker(bind=_control_engine)
LIFECYCLE_LOCK = 741910
_factories = {}
_factory_lock = threading.RLock()

def init_db():
    Base.metadata.create_all(_control_engine, tables=[SessionInfo.__table__, AppConfig.__table__])
    with _control_engine.begin() as conn:
        conn.execute(text('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS database_name VARCHAR'))
        conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS sessions_database_name_key ON sessions(database_name)'))

def lock_lifecycle(db, exclusive=True):
    function = 'pg_advisory_xact_lock' if exclusive else 'pg_advisory_xact_lock_shared'
    db.execute(text(f'SELECT {function}(:key)'), {'key': LIFECYCLE_LOCK})

def database_name(info):
    return info.database_name or f"{info.name.lower().replace(' ', '_')}_db"

def migrate_session(engine):
    """Additive upgrade for existing race databases; no original rows removed."""
    with engine.begin() as conn:
        conn.execute(text('SELECT pg_advisory_xact_lock(741911)'))
        Base.metadata.create_all(conn, tables=[Base.metadata.tables['infringements'], Base.metadata.tables['infringement_history']])
        for column, sqltype in {
            'deleted_at': 'TIMESTAMPTZ', 'requested_penalty': 'VARCHAR',
            'penalty_origin': 'VARCHAR', 'review_required': 'BOOLEAN NOT NULL DEFAULT FALSE',
            'request_id': 'VARCHAR', 'request_fingerprint': 'VARCHAR',
        }.items():
            conn.execute(text(f'ALTER TABLE infringements ADD COLUMN IF NOT EXISTS {column} {sqltype}'))
        conn.execute(text('ALTER TABLE infringement_history ADD COLUMN IF NOT EXISTS kart_number INTEGER'))
        conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS infringements_request_id_key ON infringements(request_id)'))
        conn.execute(text('''UPDATE infringements SET
            penalty_origin = CASE WHEN penalty_description = 'Warning' OR
                (penalty_description = '5 sec Stop & Go' AND warning_count >= 3)
                THEN 'automatic' ELSE 'manual' END,
            requested_penalty = CASE WHEN penalty_description = 'Warning' OR
                (penalty_description = '5 sec Stop & Go' AND warning_count >= 3)
                THEN 'Warning' ELSE penalty_description END
            WHERE penalty_origin IS NULL'''))
        conn.execute(text('''UPDATE infringement_history h SET kart_number=i.kart_number
            FROM infringements i WHERE h.infringement_id=i.id AND h.kart_number IS NULL'''))

def session_factory(info):
    name = database_name(info)
    with _factory_lock:
        if name not in _factories:
            with _control_engine.connect() as conn:
                if not conn.execute(text('SELECT 1 FROM pg_database WHERE datname=:name'), {'name': name}).scalar():
                    raise HTTPException(409, 'Session database is unavailable. Load a valid session.')
            url = make_url(CONTROL_DB_URL).set(database=name)
            # Closed races must not retain idle connections and exhaust PostgreSQL.
            # The control pool bounds simultaneous request-bound race connections.
            engine = create_engine(url, poolclass=NullPool, connect_args={'connect_timeout':5})
            try:
                migrate_session(engine)
            except Exception:
                engine.dispose()
                raise
            _factories[name] = sessionmaker(bind=engine)
        return _factories[name]

def get_db(x_session_name: str = Header(default=None)):
    control = ControlSessionLocal()
    db = None
    try:
        lock_lifecycle(control, exclusive=False)
        active = control.query(SessionInfo).filter_by(status='active').first()
        if active is None:
            raise HTTPException(400, 'No active session. Please create or load a session first.')
        if x_session_name is not None and unquote(x_session_name) != active.name:
            raise HTTPException(409, 'The active session changed. Reload before saving.')
        db = session_factory(active)()
        db.info['session_name'] = active.name
        config = control.query(AppConfig).filter_by(key='warning_expiry_minutes').first()
        db.info['warning_expiry_minutes'] = int(config.value) if config else int(os.getenv('WARNING_EXPIRY_MINUTES','180'))
        yield db
    finally:
        if db is not None:
            db.close()
        control.close()

def create_session_db(session_name):
    name = 'race_' + uuid.uuid4().hex
    with _control_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    info = SessionInfo(name=session_name, database_name=name)
    try:
        session_factory(info)
    except Exception:
        drop_session_db(info)
        raise
    return name

def drop_session_db(info):
    name = database_name(info)
    if name == make_url(CONTROL_DB_URL).database or not name.replace('_', '').replace('-', '').isalnum():
        raise HTTPException(400, 'Invalid session database identifier')
    with _factory_lock:
        factory = _factories.pop(name, None)
        if factory:
            factory.kw['bind'].dispose()
    with _control_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
        conn.execute(text('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:name'), {'name': name})
        conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))

def switch_session_db(session_name):
    """Compatibility startup check; never changes a process-global connection."""
    with ControlSessionLocal() as control:
        info = control.query(SessionInfo).filter_by(name=session_name).first()
        if not info:
            raise HTTPException(404, 'Session not found')
        session_factory(info)

init_control_db = init_db
