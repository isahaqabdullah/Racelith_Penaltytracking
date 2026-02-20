import os
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Directory to store exported session JSONs (if needed)
# Use absolute path to avoid issues in Docker
SESSION_EXPORT_DIR = os.path.abspath(os.environ.get("SESSION_EXPORT_DIR", "session_exports"))
os.makedirs(SESSION_EXPORT_DIR, exist_ok=True)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Utility Functions ---

def validate_session_name(session_name: str) -> None:
    """
    Validate session name according to naming conventions.
    
    Naming Conventions:
    - Session names are converted to database names: {name.lower().replace(' ', '_')}_db
    - Must be 1-59 characters long (to allow for "_db" suffix, max PostgreSQL identifier is 63 chars)
    - Can contain letters, numbers, spaces, underscores, and hyphens
    - Cannot start or end with a space
    - Cannot contain consecutive spaces
    - After conversion to database name, must start with a letter or underscore
    - After conversion, can only contain lowercase letters, numbers, and underscores
    
    Raises ValueError with descriptive error message if validation fails.
    """
    if not session_name:
        raise ValueError("Session name cannot be empty")
    
    # Trim whitespace
    session_name = session_name.strip()
    
    if not session_name:
        raise ValueError("Session name cannot be empty or contain only whitespace")
    
    # Check length (max 59 chars to allow for "_db" suffix = 63 total)
    if len(session_name) > 59:
        raise ValueError(
            f"Session name is too long ({len(session_name)} characters). "
            "Maximum length is 59 characters (to allow for database name conversion)."
        )
    
    # Check for leading/trailing spaces (after strip, this shouldn't happen, but check anyway)
    if session_name != session_name.strip():
        raise ValueError("Session name cannot start or end with spaces")
    
    # Check for consecutive spaces
    if "  " in session_name:
        raise ValueError("Session name cannot contain consecutive spaces")
    
    # Convert to database name format to validate
    db_name = f"{session_name.lower().replace(' ', '_')}_db"
    
    # Double-check database name length (PostgreSQL limit is 63 characters)
    if len(db_name) > 63:
        raise ValueError(
            f"Session name '{session_name}' would create a database name '{db_name}' "
            f"that exceeds PostgreSQL's 63 character limit ({len(db_name)} characters)."
        )
    
    # Check if database name starts with letter or underscore
    if not (db_name[0].isalpha() or db_name[0] == '_'):
        raise ValueError(
            "Session name must start with a letter (after conversion to database name). "
            "Names starting with numbers or special characters are not allowed."
        )
    
    # Check for invalid characters in database name
    # PostgreSQL allows: letters, digits, underscores, dollar signs
    # We're converting spaces to underscores, so check the original name
    invalid_chars = set()
    for char in session_name:
        if not (char.isalnum() or char in (' ', '_', '-')):
            invalid_chars.add(char)
    
    if invalid_chars:
        invalid_str = ', '.join(f"'{c}'" for c in sorted(invalid_chars))
        raise ValueError(
            f"Session name contains invalid characters: {invalid_str}. "
            "Allowed characters: letters, numbers, spaces, underscores, and hyphens."
        )
    
    # Check if database name would be a PostgreSQL reserved keyword (common ones)
    # Note: This is not exhaustive, but covers common cases
    reserved_keywords = {
        'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter',
        'table', 'database', 'index', 'view', 'user', 'role', 'grant', 'revoke',
        'where', 'from', 'join', 'inner', 'outer', 'left', 'right', 'on',
        'group', 'order', 'by', 'having', 'limit', 'offset', 'distinct',
        'and', 'or', 'not', 'in', 'like', 'between', 'is', 'null', 'true', 'false',
        'as', 'case', 'when', 'then', 'else', 'end', 'if', 'else', 'while',
        'begin', 'commit', 'rollback', 'transaction', 'savepoint',
        'primary', 'key', 'foreign', 'references', 'constraint', 'unique',
        'check', 'default', 'values', 'set', 'into', 'union', 'all', 'except',
        'intersect', 'exists', 'any', 'some', 'all', 'over', 'partition',
        'window', 'rows', 'range', 'preceding', 'following', 'current', 'row',
        'rank', 'dense_rank', 'row_number', 'lead', 'lag', 'first_value',
        'last_value', 'count', 'sum', 'avg', 'min', 'max', 'stddev', 'variance',
        'array', 'json', 'jsonb', 'text', 'varchar', 'char', 'int', 'integer',
        'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double', 'precision',
        'float', 'boolean', 'date', 'time', 'timestamp', 'interval', 'zone',
        'serial', 'bigserial', 'uuid', 'bytea', 'point', 'line', 'lseg', 'box',
        'path', 'polygon', 'circle', 'inet', 'cidr', 'macaddr', 'tsvector',
        'tsquery', 'xml', 'pg_lsn', 'txid_snapshot', 'pg_snapshot'
    }
    
    db_name_base = db_name[:-3]  # Remove "_db" suffix
    if db_name_base.lower() in reserved_keywords:
        raise ValueError(
            f"Session name '{session_name}' cannot be used because it would create a database name "
            f"('{db_name}') that conflicts with a PostgreSQL reserved keyword."
        )

def safe_filename(name: str) -> str:
    """
    Sanitize a string to be filesystem-safe.
    Replaces all non-alphanumeric characters with underscores.
    """
    return "".join(c if c.isalnum() or c in ("_", "-") else "_" for c in name)

def timestamp_now(fmt: str = "%Y%m%d_%H%M%S") -> str:
    """
    Return a UTC timestamp string for filenames or logs.
    Default format: YYYYMMDD_HHMMSS
    """
    return datetime.utcnow().strftime(fmt)

def utc_now() -> datetime:
    """
    Return current UTC datetime with timezone info.
    """
    return datetime.now(timezone.utc)

def utc_to_local(utc_dt: datetime, local_tz: str = "Asia/Dubai") -> datetime:
    """
    Convert UTC datetime to local timezone.
    Defaults to Asia/Dubai (Gulf Standard Time, UTC+4).
    
    Args:
        utc_dt: UTC datetime (should be timezone-aware, will be treated as UTC if naive)
        local_tz: Timezone string (default: "Asia/Dubai")
    
    Returns:
        datetime in local timezone
    """
    if utc_dt is None:
        return None
    
    # If naive, assume UTC
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
    # If not UTC, convert to UTC first
    elif utc_dt.tzinfo != timezone.utc:
        utc_dt = utc_dt.astimezone(timezone.utc)
    
    # Convert to local timezone
    local_tz_obj = ZoneInfo(local_tz)
    return utc_dt.astimezone(local_tz_obj)

def export_session_data(session_name: str, data: dict) -> str:
    """
    Export session data to a JSON file in SESSION_EXPORT_DIR.
    Returns the path of the saved file.
    """
    import json
    filename = f"{safe_filename(session_name)}_{timestamp_now()}.json"
    path = os.path.join(SESSION_EXPORT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    logger.info(f"Session data exported to {path}")
    return path

def load_session_data(file_path: str) -> dict:
    """
    Load session data from a JSON file.
    """
    import json
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Session file '{file_path}' does not exist.")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def export_session_csv(session_name: str, infringements: list, session_info: dict = None) -> str:
    """
    Export session data to CSV format.
    Returns the path of the saved file.
    """
    import csv
    filename = f"{safe_filename(session_name)}_{timestamp_now()}.csv"
    path = os.path.join(SESSION_EXPORT_DIR, filename)
    
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        
        # Write session info header
        if session_info:
            writer.writerow(["Session Information"])
            writer.writerow(["Name", session_info.get("name", "")])
            writer.writerow(["Status", session_info.get("status", "")])
            # Show local time, but include UTC for import compatibility
            started_at_local = session_info.get("started_at_local", session_info.get("started_at", ""))
            started_at_utc = session_info.get("started_at", "")
            writer.writerow(["Started At (Local)", started_at_local])
            writer.writerow(["Started At (UTC)", started_at_utc])
            writer.writerow([])  # Empty row
        
        # Write infringements header
        writer.writerow(["Infringements"])
        writer.writerow([
            "ID", "Kart Number", "Turn Number", "Description", "Observer",
            "Warning Count", "Penalty Due", "Penalty Description", 
            "Penalty Taken (Local)", "Penalty Taken (UTC)", 
            "Timestamp (Local)", "Timestamp (UTC)"
        ])
        
        # Write infringement data
        for inf in infringements:
            writer.writerow([
                inf.get("id", ""),
                inf.get("kart_number", ""),
                inf.get("turn_number", ""),
                inf.get("description", ""),
                inf.get("observer", ""),
                inf.get("warning_count", ""),
                inf.get("penalty_due", ""),
                inf.get("penalty_description", ""),
                inf.get("penalty_taken_local", ""),  # Local time (for display)
                inf.get("penalty_taken", ""),  # UTC (for import)
                inf.get("timestamp_local", ""),  # Local time (for display)
                inf.get("timestamp", "")  # UTC (for import)
            ])
        
        # Write history if available
        has_history = any(inf.get("history") for inf in infringements)
        if has_history:
            writer.writerow([])  # Empty row
            writer.writerow(["Infringement History"])
            writer.writerow([
                "Infringement ID", "Action", "Performed By", "Observer", "Details", 
                "Timestamp (Local)", "Timestamp (UTC)"
            ])
            
            for inf in infringements:
                for hist in inf.get("history", []):
                    writer.writerow([
                        inf.get("id", ""),
                        hist.get("action", ""),
                        hist.get("performed_by", ""),
                        hist.get("observer", ""),
                        hist.get("details", ""),
                        hist.get("timestamp_local", ""),  # Local time (for display)
                        hist.get("timestamp", "")  # UTC (for import)
                    ])
    
    logger.info(f"Session data exported to CSV: {path}")
    return path

def export_session_excel(session_name: str, infringements: list, session_info: dict = None) -> str:
    """
    Export session data to Excel format (.xlsx).
    Returns the path of the saved file.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    
    filename = f"{safe_filename(session_name)}_{timestamp_now()}.xlsx"
    path = os.path.join(SESSION_EXPORT_DIR, filename)
    
    wb = Workbook()
    
    # === Sheet 1: Infringements ===
    ws = wb.active
    ws.title = "Infringements"
    
    # Header style
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    
    # Write session info
    if session_info:
        ws["A1"] = "Session Information"
        ws["A1"].font = Font(bold=True, size=14)
        ws["A2"] = "Name:"
        ws["B2"] = session_info.get("name", "")
        ws["A3"] = "Status:"
        ws["B3"] = session_info.get("status", "")
        # Show local time in main display
        started_at_local = session_info.get("started_at_local", session_info.get("started_at", ""))
        started_at_utc = session_info.get("started_at", "")
        ws["A4"] = "Started At:"
        ws["B4"] = started_at_local
        # Store UTC in a hidden cell for import compatibility
        ws["C4"] = started_at_utc  # UTC (hidden/reference)
        ws.column_dimensions["C"].hidden = True  # Hide UTC column
        ws.append([])  # Empty row
    
    # Helper function to format timestamp as hh:mm:ss (local time)
    def format_time_local(timestamp_str):
        if not timestamp_str:
            return ""
        try:
            # Parse ISO format timestamp (expecting local time format)
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            return dt.strftime("%H:%M:%S")
        except (ValueError, AttributeError):
            return str(timestamp_str) if timestamp_str else ""
    
    # Helper function to format timestamp for UTC column (full ISO format)
    def format_time_utc(timestamp_str):
        if not timestamp_str:
            return ""
        try:
            # Return the full UTC timestamp string
            return timestamp_str
        except (ValueError, AttributeError):
            return str(timestamp_str) if timestamp_str else ""
    
    # Write infringements header
    start_row = 6 if session_info else 1
    headers = [
        "ID", "Kart Number", "Turn Number", "Description", "Observer",
        "Warning Count", "Penalty Due", "Penalty Description", 
        "Penalty Taken", "Timestamp",
        "Penalty Taken (UTC)", "Timestamp (UTC)"  # UTC columns (will be hidden)
    ]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=start_row, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
    
    # Write infringement data
    for inf in infringements:
        timestamp_local_str = inf.get("timestamp_local", "")
        timestamp_utc_str = inf.get("timestamp", "")
        penalty_taken_local_str = inf.get("penalty_taken_local", "")
        penalty_taken_utc_str = inf.get("penalty_taken", "")
        
        row = [
            inf.get("id", ""),
            inf.get("kart_number", ""),
            inf.get("turn_number", ""),
            inf.get("description", ""),
            inf.get("observer", ""),
            inf.get("warning_count", ""),
            inf.get("penalty_due", ""),
            inf.get("penalty_description", ""),
            format_time_local(penalty_taken_local_str),  # Local time (main column)
            format_time_local(timestamp_local_str),  # Local time (main column)
            format_time_utc(penalty_taken_utc_str),  # UTC (hidden column for import)
            format_time_utc(timestamp_utc_str)  # UTC (hidden column for import)
        ]
        ws.append(row)
    
    # Hide UTC columns (last 2 columns)
    utc_col_penalty = get_column_letter(len(headers) - 1)
    utc_col_timestamp = get_column_letter(len(headers))
    ws.column_dimensions[utc_col_penalty].hidden = True
    ws.column_dimensions[utc_col_timestamp].hidden = True
    
    # Auto-adjust column widths
    for col in range(1, len(headers) + 1):
        column_letter = get_column_letter(col)
        max_length = 0
        for row in ws[column_letter]:
            try:
                if len(str(row.value)) > max_length:
                    max_length = len(str(row.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws.column_dimensions[column_letter].width = adjusted_width
    
    # === Sheet 2: History ===
    has_history = any(inf.get("history") for inf in infringements)
    if has_history:
        ws2 = wb.create_sheet("History")
        history_headers = [
            "Infringement ID", "Action", "Performed By", "Observer", "Details", 
            "Timestamp", "Timestamp (UTC)"  # UTC column (will be hidden)
        ]
        
        for col, header in enumerate(history_headers, 1):
            cell = ws2.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        for inf in infringements:
            for hist in inf.get("history", []):
                timestamp_local_str = hist.get("timestamp_local", "")
                timestamp_utc_str = hist.get("timestamp", "")
                row = [
                    inf.get("id", ""),
                    hist.get("action", ""),
                    hist.get("performed_by", ""),
                    hist.get("observer", ""),
                    hist.get("details", ""),
                    format_time_local(timestamp_local_str),  # Local time (main column)
                    format_time_utc(timestamp_utc_str)  # UTC (hidden column for import)
                ]
                ws2.append(row)
        
        # Hide UTC column (last column)
        history_utc_col = get_column_letter(len(history_headers))
        ws2.column_dimensions[history_utc_col].hidden = True
        
        # Auto-adjust column widths for history sheet
        for col in range(1, len(history_headers) + 1):
            column_letter = get_column_letter(col)
            max_length = 0
            for row in ws2[column_letter]:
                try:
                    if len(str(row.value)) > max_length:
                        max_length = len(str(row.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            ws2.column_dimensions[column_letter].width = adjusted_width
    
    wb.save(path)
    logger.info(f"Session data exported to Excel: {path}")
    return path

def import_session_excel(file_path: str) -> dict:
    """
    Import session data from an Excel file (.xlsx).
    Returns a dictionary with session_info, infringements, and history.
    
    Expected format:
    - Sheet "Infringements": Session info at top, then headers, then data rows
    - Sheet "History" (optional): Headers, then history data rows
    """
    from openpyxl import load_workbook
    from dateutil import parser as date_parser
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Excel file '{file_path}' does not exist.")
    
    wb = load_workbook(file_path, data_only=True)
    
    # === Parse Sheet 1: Infringements ===
    if "Infringements" not in wb.sheetnames:
        raise ValueError("Excel file must contain a sheet named 'Infringements'")
    
    ws = wb["Infringements"]
    
    # Parse session info (rows 1-4)
    session_info = {}
    session_name = None
    
    # Look for session info in first few rows
    for row_idx in range(1, 6):
        cell_a = ws.cell(row=row_idx, column=1).value
        cell_b = ws.cell(row=row_idx, column=2).value
        
        if cell_a and isinstance(cell_a, str):
            if "name" in cell_a.lower() and cell_b:
                session_name = str(cell_b).strip()
                session_info["name"] = session_name
            elif "status" in cell_a.lower() and cell_b:
                session_info["status"] = str(cell_b).strip()
            elif "started" in cell_a.lower() and cell_b:
                try:
                    # Try to parse the date
                    if isinstance(cell_b, datetime):
                        session_info["started_at"] = cell_b.isoformat()
                    else:
                        session_info["started_at"] = date_parser.parse(str(cell_b)).isoformat()
                except:
                    session_info["started_at"] = str(cell_b)
    
    # Find the header row (look for "ID" or "Kart Number")
    header_row = None
    for row_idx in range(1, 20):  # Check first 20 rows
        cell_value = ws.cell(row=row_idx, column=1).value
        if cell_value and str(cell_value).strip().upper() in ["ID", "KART NUMBER"]:
            header_row = row_idx
            break
    
    if not header_row:
        raise ValueError("Could not find header row in 'Infringements' sheet")
    
    # Read headers
    headers = []
    for col in range(1, 20):  # Check up to 20 columns
        cell_value = ws.cell(row=header_row, column=col).value
        if not cell_value:
            break
        headers.append(str(cell_value).strip())
    
    # Map headers to field names
    # Priority: UTC columns first, then fall back to regular columns
    # Local time columns are ignored during import
    header_map = {
        "ID": "id",
        "Kart Number": "kart_number",
        "Turn Number": "turn_number",
        "Description": "description",
        "Observer": "observer",
        "Warning Count": "warning_count",
        "Penalty Due": "penalty_due",
        "Penalty Description": "penalty_description",
        "Penalty Taken (UTC)": "penalty_taken",  # Prefer UTC column
        "Penalty Taken": "penalty_taken_fallback",  # Fallback if no UTC column
        "Timestamp (UTC)": "timestamp",  # Prefer UTC column
        "Timestamp": "timestamp_fallback"  # Fallback if no UTC column
    }
    
    # Read infringement data
    infringements = []
    data_start_row = header_row + 1
    
    for row_idx in range(data_start_row, ws.max_row + 1):
        # Check if row is empty
        first_cell = ws.cell(row=row_idx, column=1).value
        if not first_cell:
            continue
        
        inf = {}
        for col_idx, header in enumerate(headers, 1):
            field_name = header_map.get(header)
            if not field_name:
                continue
            
            cell_value = ws.cell(row=row_idx, column=col_idx).value
            
            # Convert based on field type
            if field_name == "id":
                inf[field_name] = int(cell_value) if cell_value is not None else None
            elif field_name in ["kart_number", "warning_count"]:
                try:
                    inf[field_name] = int(cell_value) if cell_value is not None else None
                except (ValueError, TypeError):
                    inf[field_name] = None
            elif field_name == "turn_number":
                try:
                    inf[field_name] = str(cell_value).strip() if cell_value is not None else None
                except (ValueError, TypeError):
                    inf[field_name] = None
            elif field_name == "penalty_taken":
                # Priority: Use UTC column if available
                if cell_value:
                    try:
                        if isinstance(cell_value, datetime):
                            inf[field_name] = cell_value.isoformat()
                        else:
                            inf[field_name] = date_parser.parse(str(cell_value)).isoformat()
                    except:
                        inf[field_name] = str(cell_value) if cell_value else None
                else:
                    inf[field_name] = None
            elif field_name == "penalty_taken_fallback":
                # Fallback: Only use if penalty_taken not already set
                if "penalty_taken" not in inf or not inf.get("penalty_taken"):
                    if cell_value:
                        try:
                            if isinstance(cell_value, datetime):
                                inf["penalty_taken"] = cell_value.isoformat()
                            else:
                                inf["penalty_taken"] = date_parser.parse(str(cell_value)).isoformat()
                        except:
                            inf["penalty_taken"] = str(cell_value) if cell_value else None
                    else:
                        inf["penalty_taken"] = None
            elif field_name == "timestamp":
                # Priority: Use UTC column if available
                if cell_value:
                    try:
                        if isinstance(cell_value, datetime):
                            inf[field_name] = cell_value.isoformat()
                        else:
                            inf[field_name] = date_parser.parse(str(cell_value)).isoformat()
                    except:
                        inf[field_name] = str(cell_value) if cell_value else None
                else:
                    inf[field_name] = None
            elif field_name == "timestamp_fallback":
                # Fallback: Only use if timestamp not already set
                if "timestamp" not in inf or not inf.get("timestamp"):
                    if cell_value:
                        try:
                            if isinstance(cell_value, datetime):
                                inf["timestamp"] = cell_value.isoformat()
                            else:
                                inf["timestamp"] = date_parser.parse(str(cell_value)).isoformat()
                        except:
                            inf["timestamp"] = str(cell_value) if cell_value else None
                    else:
                        inf["timestamp"] = None
            elif field_name == "penalty_due":
                inf[field_name] = str(cell_value).strip() if cell_value else "No"
            else:
                inf[field_name] = str(cell_value).strip() if cell_value else None
        
        # Only add if we have at least kart_number and description
        if inf.get("kart_number") and inf.get("description"):
            infringements.append(inf)
    
    # === Parse Sheet 2: History (if exists) ===
    history = []
    if "History" in wb.sheetnames:
        ws2 = wb["History"]
        
        # Find header row
        history_header_row = None
        for row_idx in range(1, 10):
            cell_value = ws2.cell(row=row_idx, column=1).value
            if cell_value and "Infringement ID" in str(cell_value):
                history_header_row = row_idx
                break
        
        if history_header_row:
            # Read history headers
            history_headers = []
            for col in range(1, 20):
                cell_value = ws2.cell(row=history_header_row, column=col).value
                if not cell_value:
                    break
                history_headers.append(str(cell_value).strip())
            
            history_header_map = {
                "Infringement ID": "infringement_id",
                "Action": "action",
                "Performed By": "performed_by",
                "Observer": "observer",
                "Details": "details",
                "Timestamp (UTC)": "timestamp",  # Prefer UTC column
                "Timestamp": "timestamp_fallback"  # Fallback if no UTC column
            }
            
            # Read history data
            for row_idx in range(history_header_row + 1, ws2.max_row + 1):
                first_cell = ws2.cell(row=row_idx, column=1).value
                if not first_cell:
                    continue
                
                hist = {}
                for col_idx, header in enumerate(history_headers, 1):
                    field_name = history_header_map.get(header)
                    if not field_name:
                        continue
                    
                    cell_value = ws2.cell(row=row_idx, column=col_idx).value
                    
                    if field_name == "infringement_id":
                        try:
                            hist[field_name] = int(cell_value) if cell_value is not None else None
                        except (ValueError, TypeError):
                            hist[field_name] = None
                    elif field_name == "timestamp":
                        # Priority: Use UTC column if available
                        if cell_value:
                            try:
                                if isinstance(cell_value, datetime):
                                    hist[field_name] = cell_value.isoformat()
                                else:
                                    hist[field_name] = date_parser.parse(str(cell_value)).isoformat()
                            except:
                                hist[field_name] = str(cell_value) if cell_value else None
                        else:
                            hist[field_name] = None
                    elif field_name == "timestamp_fallback":
                        # Fallback: Only use if timestamp not already set
                        if "timestamp" not in hist or not hist.get("timestamp"):
                            if cell_value:
                                try:
                                    if isinstance(cell_value, datetime):
                                        hist["timestamp"] = cell_value.isoformat()
                                    else:
                                        hist["timestamp"] = date_parser.parse(str(cell_value)).isoformat()
                                except:
                                    hist["timestamp"] = str(cell_value) if cell_value else None
                            else:
                                hist["timestamp"] = None
                    else:
                        hist[field_name] = str(cell_value).strip() if cell_value else None
                
                if hist.get("infringement_id") and hist.get("action"):
                    history.append(hist)
    
    # Group history by infringement_id
    history_by_inf_id = {}
    for hist in history:
        inf_id = hist.get("infringement_id")
        if inf_id:
            if inf_id not in history_by_inf_id:
                history_by_inf_id[inf_id] = []
            history_by_inf_id[inf_id].append(hist)
    
    # Attach history to infringements
    for inf in infringements:
        inf_id = inf.get("id")
        if inf_id and inf_id in history_by_inf_id:
            inf["history"] = history_by_inf_id[inf_id]
        else:
            inf["history"] = []
    
    logger.info(f"Imported {len(infringements)} infringements and {len(history)} history records from {file_path}")
    
    return {
        "session_info": session_info,
        "infringements": infringements
    }

def import_session_csv(file_path: str) -> dict:
    """
    Import session data from a CSV file.
    Returns a dictionary with session_info, infringements, and history.
    
    Expected format matches export_session_csv output.
    """
    import csv
    from dateutil import parser as date_parser
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"CSV file '{file_path}' does not exist.")
    
    session_info = {}
    infringements = []
    history = []
    
    with open(file_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)
    
    # Parse session info (first few rows)
    i = 0
    while i < len(rows) and i < 10:
        row = rows[i]
        if len(row) >= 2:
            if row[0] and "name" in row[0].lower():
                session_info["name"] = row[1] if len(row) > 1 else ""
            elif row[0] and "status" in row[0].lower():
                session_info["status"] = row[1] if len(row) > 1 else ""
            elif row[0] and "started" in row[0].lower():
                session_info["started_at"] = row[1] if len(row) > 1 else ""
        if row and row[0] == "Infringements":
            i += 1
            break
        i += 1
    
    # Find header row
    header_row_idx = None
    for idx in range(i, min(i + 5, len(rows))):
        if rows[idx] and len(rows[idx]) > 0:
            first_col = rows[idx][0].strip() if rows[idx][0] else ""
            if first_col.upper() in ["ID", "KART NUMBER"]:
                header_row_idx = idx
                break
    
    if not header_row_idx:
        raise ValueError("Could not find infringements header row in CSV")
    
    # Read headers
    headers = [h.strip() for h in rows[header_row_idx]]
    
    # Map headers to field names
    # Priority: UTC columns first, then fall back to regular columns
    # Local time columns are ignored during import
    header_map = {
        "ID": "id",
        "Kart Number": "kart_number",
        "Turn Number": "turn_number",
        "Description": "description",
        "Observer": "observer",
        "Warning Count": "warning_count",
        "Penalty Due": "penalty_due",
        "Penalty Description": "penalty_description",
        "Penalty Taken (UTC)": "penalty_taken",  # Prefer UTC column
        "Penalty Taken": "penalty_taken_fallback",  # Fallback if no UTC column
        "Timestamp (UTC)": "timestamp",  # Prefer UTC column
        "Timestamp": "timestamp_fallback"  # Fallback if no UTC column
    }
    
    # Read infringement data
    data_start = header_row_idx + 1
    for row_idx in range(data_start, len(rows)):
        row = rows[row_idx]
        
        # Skip empty rows
        if not row or not row[0]:
            # Check if we've hit the history section
            if row_idx < len(rows) - 1 and rows[row_idx + 1] and len(rows[row_idx + 1]) > 0:
                if rows[row_idx + 1][0] and "History" in rows[row_idx + 1][0]:
                    break
            continue
        
        # Check if we've hit the history section
        if row[0] and "History" in row[0]:
            break
        
        inf = {}
        for col_idx, header in enumerate(headers):
            if col_idx >= len(row):
                break
            field_name = header_map.get(header)
            if not field_name:
                continue
            
            value = row[col_idx].strip() if col_idx < len(row) and row[col_idx] else ""
            
            # Convert based on field type
            if field_name == "id":
                try:
                    inf[field_name] = int(value) if value else None
                except:
                    inf[field_name] = None
            elif field_name in ["kart_number", "warning_count"]:
                try:
                    inf[field_name] = int(value) if value else None
                except:
                    inf[field_name] = None
            elif field_name == "turn_number":
                inf[field_name] = value if value else None
            elif field_name == "penalty_taken":
                # Priority: Use UTC column if available
                if value:
                    try:
                        inf[field_name] = date_parser.parse(value).isoformat()
                    except:
                        inf[field_name] = value
                else:
                    inf[field_name] = None
            elif field_name == "penalty_taken_fallback":
                # Fallback: Only use if penalty_taken not already set
                if "penalty_taken" not in inf or not inf.get("penalty_taken"):
                    if value:
                        try:
                            inf["penalty_taken"] = date_parser.parse(value).isoformat()
                        except:
                            inf["penalty_taken"] = value
                    else:
                        inf["penalty_taken"] = None
            elif field_name == "timestamp":
                # Priority: Use UTC column if available
                if value:
                    try:
                        inf[field_name] = date_parser.parse(value).isoformat()
                    except:
                        inf[field_name] = value
                else:
                    inf[field_name] = None
            elif field_name == "timestamp_fallback":
                # Fallback: Only use if timestamp not already set
                if "timestamp" not in inf or not inf.get("timestamp"):
                    if value:
                        try:
                            inf["timestamp"] = date_parser.parse(value).isoformat()
                        except:
                            inf["timestamp"] = value
                    else:
                        inf["timestamp"] = None
            elif field_name == "penalty_due":
                inf[field_name] = value if value else "No"
            else:
                inf[field_name] = value if value else None
        
        # Only add if we have at least kart_number and description
        if inf.get("kart_number") and inf.get("description"):
            infringements.append(inf)
    
    # Parse history if present
    history_start = None
    for idx in range(len(rows)):
        if rows[idx] and len(rows[idx]) > 0 and "History" in rows[idx][0]:
            history_start = idx + 1
            break
    
    if history_start:
        # Find history header
        history_header_idx = None
        for idx in range(history_start, min(history_start + 3, len(rows))):
            if rows[idx] and len(rows[idx]) > 0:
                if "Infringement ID" in rows[idx][0]:
                    history_header_idx = idx
                    break
        
        if history_header_idx:
            history_headers = [h.strip() for h in rows[history_header_idx]]
            history_header_map = {
                "Infringement ID": "infringement_id",
                "Action": "action",
                "Performed By": "performed_by",
                "Observer": "observer",
                "Details": "details",
                "Timestamp (UTC)": "timestamp",  # Prefer UTC column
                "Timestamp": "timestamp_fallback"  # Fallback if no UTC column
            }
            
            for row_idx in range(history_header_idx + 1, len(rows)):
                row = rows[row_idx]
                if not row or not row[0]:
                    continue
                
                hist = {}
                for col_idx, header in enumerate(history_headers):
                    if col_idx >= len(row):
                        break
                    field_name = history_header_map.get(header)
                    if not field_name:
                        continue
                    
                    value = row[col_idx].strip() if col_idx < len(row) and row[col_idx] else ""
                    
                    if field_name == "infringement_id":
                        try:
                            hist[field_name] = int(value) if value else None
                        except:
                            hist[field_name] = None
                    elif field_name == "timestamp":
                        # Priority: Use UTC column if available
                        if value:
                            try:
                                hist[field_name] = date_parser.parse(value).isoformat()
                            except:
                                hist[field_name] = value
                        else:
                            hist[field_name] = None
                    elif field_name == "timestamp_fallback":
                        # Fallback: Only use if timestamp not already set
                        if "timestamp" not in hist or not hist.get("timestamp"):
                            if value:
                                try:
                                    hist["timestamp"] = date_parser.parse(value).isoformat()
                                except:
                                    hist["timestamp"] = value
                            else:
                                hist["timestamp"] = None
                    else:
                        hist[field_name] = value if value else None
                
                if hist.get("infringement_id") and hist.get("action"):
                    history.append(hist)
    
    # Group history by infringement_id
    history_by_inf_id = {}
    for hist in history:
        inf_id = hist.get("infringement_id")
        if inf_id:
            if inf_id not in history_by_inf_id:
                history_by_inf_id[inf_id] = []
            history_by_inf_id[inf_id].append(hist)
    
    # Attach history to infringements
    for inf in infringements:
        inf_id = inf.get("id")
        if inf_id and inf_id in history_by_inf_id:
            inf["history"] = history_by_inf_id[inf_id]
        else:
            inf["history"] = []
    
    logger.info(f"Imported {len(infringements)} infringements and {len(history)} history records from CSV {file_path}")
    
    return {
        "session_info": session_info,
        "infringements": infringements
    }
