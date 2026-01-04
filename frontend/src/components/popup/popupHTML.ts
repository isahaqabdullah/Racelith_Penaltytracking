/**
 * HTML structure for the infringement log popup window
 */
export const popupHTML = `
<div class="container">
  <div class="header">
    <h1>Recent Infringements</h1>
    <div class="search-container">
      <button class="back-btn" id="backBtn">Back</button>
      <select class="filter-select" id="filterSelect">
        <option value="all">All Entries</option>
        <option value="warning-flag">Warning Flag</option>
        <option value="penalties">Penalties</option>
      </select>
      <input type="text" class="search-input" id="searchInput" placeholder="Search by kart #" />
    </div>
  </div>
  <table id="infringementTable">
    <thead>
      <tr>
        <th>Time</th>
        <th>Kart #</th>
        <th>Turn</th>
        <th>Infringement</th>
        <th>Penalty</th>
        <th>Observer</th>
        <th>Status</th>
        <th style="text-align: right;">Actions</th>
      </tr>
    </thead>
    <tbody id="tableBody">
      <tr>
        <td colspan="8" class="empty">Loading...</td>
      </tr>
    </tbody>
  </table>
</div>
<div id="editModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title">Edit Infringement</h2>
      <button class="modal-close" id="closeModal">&times;</button>
    </div>
    <form id="editForm">
      <div class="form-group">
        <label class="form-label">Kart Number</label>
        <input type="text" class="form-input" id="editKart" placeholder="e.g., 42" required />
      </div>
      <div class="form-group">
        <label class="form-label">Turn</label>
        <input type="text" class="form-input" id="editTurn" placeholder="e.g., 3" />
      </div>
      <div class="form-group">
        <label class="form-label">Observer</label>
        <input type="text" class="form-input" id="editObserver" placeholder="Observer name (optional)" />
      </div>
      <div class="form-group">
        <label class="form-label">Infringement</label>
        <select class="form-select" id="editInfringement">
          <option value="">Select...</option>
          <option value="White Line Infringement">White Line Infringement</option>
          <option value="Yellow Zone Infringement">Yellow Zone Infringement</option>
          <option value="Advantage by Contact">Advantage by Contact</option>
          <option value="Contact">Contact</option>
          <option value="Overtaking under yellow flag">Overtaking under yellow flag</option>
          <option value="Not Slowing under yellow flag">Not Slowing under yellow flag</option>
          <option value="Pit Time Infringement">Pit Time Infringement</option>
          <option value="Dangerous Driving">Dangerous Driving</option>
          <option value="Excessive Weaving or Blocking">Excessive Weaving or Blocking</option>
          <option value="Unsafe Re-entry">Unsafe Re-entry</option>
          <option value="Ignoring Flags">Ignoring Flags</option>
          <option value="Pit Lane Speed">Pit Lane Speed</option>
          <option value="Advantage-Exceeding track limits">Advantage-Exceeding track limits</option>
          <option value="Track Limits">Track Limits</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="form-group" id="secondKartGroup" style="display: none;">
        <label class="form-label">Other Kart Number (optional)</label>
        <input type="text" class="form-input" id="editSecondKart" placeholder="e.g., 15" />
      </div>
      <div class="form-group">
        <label class="form-label">Penalty</label>
        <select class="form-select" id="editPenalty">
          <option value="">Select...</option>
          <option value="Warning">Warning</option>
          <option value="5 Sec">5 Sec</option>
          <option value="10 Sec">10 Sec</option>
          <option value="Grid Penalty">Grid Penalty</option>
          <option value="No further action">No further action</option>
          <option value="Under investigation">Under investigation</option>
          <option value="Fastest Lap Invalidation">Fastest Lap Invalidation</option>
          <option value="Lap Invalidation">Lap Invalidation</option>
          <option value="Stop and Go">Stop and Go</option>
          <option value="Drive Through">Drive Through</option>
          <option value="Time Penalty">Time Penalty</option>
          <option value="Disqualification">Disqualification</option>
          <option value="Black Flag">Black Flag</option>
        </select>
      </div>
      <div class="form-group" id="lapNumberGroup" style="display: none;">
        <label class="form-label">Lap Number</label>
        <input type="text" class="form-input" id="editLapNumber" placeholder="e.g., 5" />
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="cancelEdit">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>
`;

