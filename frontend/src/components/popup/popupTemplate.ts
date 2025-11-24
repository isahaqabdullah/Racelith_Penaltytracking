/**
 * Generates the complete HTML document for the infringement log popup window
 */
import { popupStyles } from './popupStyles';
import { popupHTML } from './popupHTML';
import { generatePopupScript } from './popupScript';

export function generatePopupHTML(apiBase: string, warningExpiryMinutes: number): string {
  const script = generatePopupScript(apiBase, warningExpiryMinutes);
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>Infringement Log</title>
  <style>${popupStyles}</style>
</head>
<body>
  ${popupHTML}
  <script>${script}</script>
</body>
</html>`;
}

