"""Deterministic incident replay. Every mutation holds the session's DB lock."""
import json
from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from .models import Infringement, InfringementHistory

AUTOMATIC_PENALTY = '5 sec Stop & Go'

def utc(value):
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

def iso(value):
    return utc(value).isoformat().replace('+00:00', 'Z') if value else None

def lock_incidents(db):
    # One lock per physical race DB also covers kart/type changes and bulk apply.
    db.execute(text('SELECT pg_advisory_xact_lock(741912)'))

def kind(description):
    desc = (description or '').lower()
    if 'white line infringement' in desc:
        return 'white'
    if 'yellow zone' in desc:
        return 'yellow'
    return None

def is_penalty(description):
    return bool(description and description.strip().lower() not in ('warning', 'no further action'))

def set_requested(inf, requested):
    inf.requested_penalty = (requested or '').strip() or None
    inf.penalty_origin = 'automatic' if kind(inf.description) and (not requested or requested.strip().lower() == 'warning') else 'manual'

def snapshot(inf):
    return {k: getattr(inf, k) for k in ('kart_number','turn_number','description','observer','warning_count','penalty_due','penalty_description','penalty_origin','requested_penalty','review_required')} | {
        'timestamp': iso(inf.timestamp), 'penalty_taken': iso(inf.penalty_taken), 'deleted_at': iso(inf.deleted_at)}

def audit(db, inf, action, actor, details):
    db.add(InfringementHistory(session_name=db.info.get('session_name', inf.session_name),
        kart_number=inf.kart_number, infringement_id=inf.id, action=action,
        performed_by=actor or 'System', observer=inf.observer,
        details=json.dumps(details, ensure_ascii=False), timestamp=datetime.now(timezone.utc)))

def replay(db, karts, actor='System'):
    db.flush()
    expiry = timedelta(minutes=db.info.get('warning_expiry_minutes', 180))
    rows = db.query(Infringement).filter(Infringement.kart_number.in_(karts), Infringement.deleted_at.is_(None)).order_by(Infringement.timestamp, Infringement.id).all()
    cycles = {}
    for inf in rows:
        before = snapshot(inf)
        group = kind(inf.description)
        key = (inf.kart_number, group)
        warnings = cycles.setdefault(key, [])
        moment = utc(inf.timestamp)
        warnings[:] = [t for t in warnings if moment - expiry <= t <= moment]
        if inf.penalty_origin == 'automatic' and group:
            count = len(warnings) + 1
            predicted = AUTOMATIC_PENALTY if count >= 3 else 'Warning'
            if inf.penalty_taken:
                # A physical penalty remains served even if a later correction invalidates it.
                inf.penalty_due = 'No'
                inf.warning_count = 0
                inf.review_required = not is_penalty(predicted)
                warnings.clear()
            else:
                inf.warning_count = count
                inf.penalty_description = predicted
                inf.penalty_due = 'Yes' if count >= 3 else 'No'
                inf.review_required = False
                if count >= 3:
                    warnings.clear()
                else:
                    warnings.append(moment)
        else:
            inf.warning_count = 1
            if not inf.penalty_taken:
                inf.penalty_description = inf.requested_penalty
            inf.penalty_due = 'No' if inf.penalty_taken else ('Yes' if is_penalty(inf.requested_penalty) else 'No')
            if group and is_penalty(inf.requested_penalty):
                warnings.clear()
        after = snapshot(inf)
        if after != before:
            audit(db, inf, 'recalculated', actor, {'before': before, 'after': after})
    db.flush()


def warning_flags(db):
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(minutes=db.info.get('warning_expiry_minutes', 180))
    cycles = {}
    for inf in db.query(Infringement).filter(Infringement.deleted_at.is_(None)).order_by(Infringement.timestamp, Infringement.id):
        group = kind(inf.description)
        if not group: continue
        key = (inf.kart_number, group)
        entries = cycles.setdefault(key, [])
        if is_penalty(inf.penalty_description):
            entries.clear()
        elif inf.penalty_description == 'Warning' and threshold <= utc(inf.timestamp) <= now:
            entries.append(inf.id)
    return {ids[1] for ids in cycles.values() if len(ids) >= 2}
