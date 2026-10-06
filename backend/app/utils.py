"""Session display-name validation shared by all lifecycle routes."""
import re


def validate_session_name(session_name: str) -> None:
    if not session_name:
        raise ValueError('Session name cannot be empty')
    if session_name != session_name.strip():
        raise ValueError('Session name cannot start or end with spaces')
    if len(session_name) > 59:
        raise ValueError('Session name must be at most 59 characters')
    if '  ' in session_name:
        raise ValueError('Session name cannot contain consecutive spaces')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9 _-]*', session_name):
        raise ValueError('Start with a letter or underscore; use letters, numbers, spaces, underscores or hyphens')
