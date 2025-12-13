/**
 * JavaScript logic for the infringement log popup window
 * This generates the script that runs in the popup window
 */
export function generatePopupScript(apiBase: string, warningExpiryMinutes: number): string {
  // Escape the API base URL for safe embedding in JavaScript
  const apiBaseEscaped = JSON.stringify(apiBase);
  
  return `
(function() {
  const API_BASE = ${apiBaseEscaped};
  const WARNING_EXPIRY_MINUTES = ${warningExpiryMinutes};
  let socket = null;
  let currentEditId = null;

  // Format timestamp to readable time
  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  // Check if a warning infringement has expired
  function isExpired(inf) {
    if (inf.penalty_description !== "Warning") return false;
    const timestamp = new Date(inf.timestamp);
    const now = new Date();
    const diffMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);
    return diffMinutes > WARNING_EXPIRY_MINUTES;
  }

  // Check if this is a penalty entry
  function isPenaltyEntry(inf) {
    const description = (inf.penalty_description || "").toLowerCase();
    const hasMeaningfulPenalty =
      inf.penalty_description &&
      description !== "warning" &&
      description !== "no further action";
    const pendingPenalty = inf.penalty_due === "Yes" && hasMeaningfulPenalty;
    const appliedPenalty = inf.penalty_due === "No" && inf.penalty_taken && !(inf.penalty_description === "Warning");
    return pendingPenalty || appliedPenalty;
  }

  // Get status label for an infringement
  function getStatus(inf) {
    const isWarning = inf.penalty_description === "Warning";
    const applied = inf.penalty_due === "No" && inf.penalty_taken && !isWarning;
    const isNoFurtherAction = inf.penalty_description === "No further action";
    
    if (applied) return "Applied";
    if (isExpired(inf)) return "Expired";
    if (isWarning) return "Warning";
    if (isNoFurtherAction && inf.penalty_due === "No") return "No action";
    if (inf.penalty_due === "Yes") return "Pending";
    return "Cleared";
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Check if this is a 2nd warning for white line or yellow zone
  // This calculates the actual current warning count by counting only non-expired warnings
  function isSecondWarning(inf, allInfringements) {
    const isWarning = inf.penalty_description === "Warning";
    if (!isWarning) return false;
    
    const description = (inf.description || "").toLowerCase();
    const isWhiteLine = description.includes("white line infringement");
    const isYellowZone = description.includes("yellow zone");
    
    if (!isWhiteLine && !isYellowZone) return false;
    
    // Check if this warning itself is expired
    if (isExpired(inf)) return false;
    
    // Calculate the actual current warning count by counting all valid (non-expired) warnings
    // for the same kart and same infringement type, up to and including this one
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() - WARNING_EXPIRY_MINUTES * 60 * 1000);
    
    // Find the last penalty for this kart and infringement type (if any)
    const lastPenalty = allInfringements
      .filter(i => 
        i.kart_number === inf.kart_number &&
        i.description && i.description.toLowerCase().includes(isWhiteLine ? "white line infringement" : "yellow zone") &&
        i.penalty_due === "Yes"
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    // Determine the cycle start (either expiry threshold or last penalty timestamp, whichever is later)
    const cycleStart = lastPenalty 
      ? new Date(Math.max(expiryThreshold.getTime(), new Date(lastPenalty.timestamp).getTime()))
      : expiryThreshold;
    
    // Count all valid warnings for this kart and infringement type
    // Valid means: not expired, hasn't triggered a penalty, and is within the cycle
    const validWarnings = allInfringements.filter(i => {
      if (i.kart_number !== inf.kart_number) return false;
      const iDesc = (i.description || "").toLowerCase();
      const matchesType = isWhiteLine 
        ? iDesc.includes("white line infringement")
        : iDesc.includes("yellow zone");
      if (!matchesType) return false;
      
      // Must be a warning
      if (i.penalty_description !== "Warning") return false;
      
      // Must not have triggered a penalty
      if (i.penalty_due === "Yes") return false;
      
      // Must be within the cycle (after cycle start)
      const iTimestamp = new Date(i.timestamp);
      if (iTimestamp < cycleStart) return false;
      
      // Must not be expired
      if (isExpired(i)) return false;
      
      // Must be before or equal to the current infringement's timestamp
      return new Date(i.timestamp).getTime() <= new Date(inf.timestamp).getTime();
    });
    
    // Sort by timestamp to get the order
    validWarnings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Find the position of the current infringement in the valid warnings list
    const currentIndex = validWarnings.findIndex(w => w.id === inf.id);
    
    // It's the 2nd warning if it's at index 1 (0-indexed, so 2nd item)
    return currentIndex === 1;
  }

  // Generate table row HTML for an infringement
  function generateRowHTML(inf, allInfringements) {
    const id = escapeHtml(inf.id.toString());
    const kartNum = escapeHtml(inf.kart_number.toString());
    const time = escapeHtml(formatTime(inf.timestamp));
    const turn = inf.turn_number ? escapeHtml(inf.turn_number.toString()) : "—";
    const description = escapeHtml(inf.description || "");
    const penalty = inf.penalty_description ? escapeHtml(inf.penalty_description) : "—";
    const observer = inf.observer ? escapeHtml(inf.observer) : "—";
    const status = escapeHtml(getStatus(inf));
    const statusClass = getStatus(inf).toLowerCase();
    const showWarningFlag = isSecondWarning(inf, allInfringements);
    
    const editIcon = '<svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>';
    const deleteIcon = '<svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';
    const flagIcon = '<svg class="warning-flag-icon" viewBox="0 0 24 24" style="width: 20px; height: 20px; background-color: #e5e7eb;" title="Second warning - next warning will result in penalty">' +
      '<rect x="0" y="0" width="24" height="24" fill="#e5e7eb"/>' +
      '<rect x="2" y="2" width="2" height="18" fill="black"/>' +
      '<polygon points="4,2 4,14 16,14" fill="white"/>' +
      '<polygon points="4,2 18,2 16,14" fill="black"/>' +
      '</svg>';

    const statusCell = '<td>' +
      '<div style="display: flex; align-items: center; gap: 8px;">' +
      '<span class="badge badge-' + statusClass + '">' + status + '</span>' +
      (showWarningFlag ? flagIcon : '') +
      '</div>' +
      '</td>';

    return '<tr data-kart="' + kartNum + '" data-id="' + id + '">' +
      '<td>' + time + '</td>' +
      '<td>' + kartNum + '</td>' +
      '<td>' + turn + '</td>' +
      '<td>' + description + '</td>' +
      '<td>' + penalty + '</td>' +
      '<td>' + observer + '</td>' +
      statusCell +
      '<td>' +
      '<div class="actions">' +
      '<button class="btn btn-edit" onclick="window.handleEdit(' + id + ')" title="Edit">' + editIcon + '</button>' +
      '<button class="btn btn-delete" onclick="window.handleDelete(' + id + ')" title="Delete">' + deleteIcon + '</button>' +
      '</div>' +
      '</td>' +
      '</tr>';
  }

  // Refresh the table with current data
  async function refreshTable() {
    const tbody = document.getElementById("tableBody");
    if (!tbody) {
      console.error("Table body not found");
      return;
    }

    try {
      // Fetch with high limit to get all infringements for popup display
      console.log("Fetching from:", API_BASE + "/infringements/?page=1&limit=1000");
      const response = await fetch(API_BASE + "/infringements/?page=1&limit=1000");
      if (!response.ok) {
        throw new Error("Failed: " + response.status + " " + response.statusText);
      }

      const responseData = await response.json();
      // Handle paginated response format: { items: [...], total: ..., page: ..., limit: ..., total_pages: ... }
      // Or legacy array format for backwards compatibility
      const data = Array.isArray(responseData) ? responseData : (responseData.items || []);
      console.log("Fetched data:", data.length, "infringements");
      const searchInput = document.getElementById("searchInput");
      const backBtn = document.getElementById("backBtn");
      const filterSelect = document.getElementById("filterSelect");
      const searchValue = searchInput ? searchInput.value.trim() : "";
      const filterValue = filterSelect ? filterSelect.value : "all";

      // Show/hide back button based on search
      if (backBtn) {
        if (searchValue) {
          backBtn.classList.add("show");
        } else {
          backBtn.classList.remove("show");
        }
      }

      // Filter by kart number (exact match)
      let filtered = searchValue
        ? data.filter(inf => {
            const kartNum = inf.kart_number.toString();
            return kartNum === searchValue || Number(kartNum) === Number(searchValue);
          })
        : data;

      // Apply filter type
      if (filterValue === "penalties") {
        filtered = filtered.filter(isPenaltyEntry);
      } else if (filterValue === "warning-flag") {
        filtered = filtered.filter(inf => isSecondWarning(inf, data));
      }

      if (filtered.length === 0) {
        const message = searchValue
          ? "No infringements found for kart #" + escapeHtml(searchValue)
          : "No infringements logged yet";
        tbody.innerHTML = '<tr><td colspan="8" class="empty">' + message + '</td></tr>';
      } else {
        tbody.innerHTML = filtered.map(inf => generateRowHTML(inf, data)).join("");
      }
    } catch (error) {
      console.error("Refresh error:", error);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">Error: ' + escapeHtml(error.message || "Unknown") + '</td></tr>';
      }
    }
  }

  // Filter table on search input or filter change
  function filterTable() {
    refreshTable();
  }

  // Clear search
  function clearSearch() {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.value = "";
      filterTable();
    }
  }

  // Handle edit button click
  window.handleEdit = async function(id) {
    try {
      // Fetch with high limit to get all infringements for editing
      const response = await fetch(API_BASE + "/infringements/?page=1&limit=1000");
      if (!response.ok) {
        throw new Error("Failed to fetch");
      }

      const responseData = await response.json();
      // Handle paginated response format: { items: [...], total: ..., page: ..., limit: ..., total_pages: ... }
      // Or legacy array format for backwards compatibility
      const data = Array.isArray(responseData) ? responseData : (responseData.items || []);
      const inf = data.find(i => i.id === Number(id) || i.id === id);
      
      if (!inf) {
        throw new Error("Infringement not found");
      }

      currentEditId = Number(id);
      document.getElementById("editKart").value = inf.kart_number || "";
      document.getElementById("editTurn").value = inf.turn_number || "";
      document.getElementById("editObserver").value = inf.observer || "";
      
      // Parse description to extract infringement type and second kart number
      const description = inf.description || "";
      let baseInfringementType = description;
      let extractedSecondKart = "";
      
      // Check if description is in format "ABC over X" or "Contact over X"
      if (description && description.startsWith("ABC over ")) {
        baseInfringementType = "Advantage by Contact";
        extractedSecondKart = description.replace("ABC over ", "");
      } else if (description && description.startsWith("Contact over ")) {
        baseInfringementType = "Contact";
        extractedSecondKart = description.replace("Contact over ", "");
      }
      
      document.getElementById("editInfringement").value = baseInfringementType;
      document.getElementById("editSecondKart").value = extractedSecondKart;
      
      // Show/hide second kart field
      const secondKartGroup = document.getElementById("secondKartGroup");
      if (baseInfringementType === "Advantage by Contact" || baseInfringementType === "Contact") {
        secondKartGroup.style.display = "block";
      } else {
        secondKartGroup.style.display = "none";
      }
      
      // Parse penalty_description to extract lap number for "Lap Invalidation"
      const penaltyDesc = inf.penalty_description || "";
      let basePenaltyDescription = penaltyDesc;
      let extractedLapNumber = "";
      
      // Check if penalty_description is in format "Lap Invalidation - Lap X"
      if (penaltyDesc && penaltyDesc.startsWith("Lap Invalidation - Lap ")) {
        basePenaltyDescription = "Lap Invalidation";
        extractedLapNumber = penaltyDesc.replace("Lap Invalidation - Lap ", "");
      }
      
      document.getElementById("editPenalty").value = basePenaltyDescription;
      document.getElementById("editLapNumber").value = extractedLapNumber;
      
      // Show/hide lap number field
      const lapNumberGroup = document.getElementById("lapNumberGroup");
      if (basePenaltyDescription === "Lap Invalidation") {
        lapNumberGroup.style.display = "block";
      } else {
        lapNumberGroup.style.display = "none";
      }
      
      document.getElementById("editModal").classList.add("show");
    } catch (error) {
      console.error("Edit error:", error);
      alert("Failed to load infringement: " + error.message);
    }
  };

  // Handle delete button click
  window.handleDelete = async function(id) {
    if (!confirm("Are you sure you want to delete this infringement?")) {
      return;
    }

    try {
      const response = await fetch(API_BASE + "/infringements/" + id, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
      });

      if (response.ok) {
        await refreshTable();
        if (window.opener) {
          window.opener.postMessage({ type: "deleteInfringement", id: id }, "*");
        }
      } else {
        alert("Failed to delete");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Error deleting");
    }
  };

  // Handle infringement type change to show/hide second kart field
  function handleInfringementChange() {
    const infringementType = document.getElementById("editInfringement").value;
    const secondKartGroup = document.getElementById("secondKartGroup");
    if (infringementType === "Advantage by Contact" || infringementType === "Contact") {
      secondKartGroup.style.display = "block";
    } else {
      secondKartGroup.style.display = "none";
      document.getElementById("editSecondKart").value = "";
    }
    
    // Auto-set penalty to Warning for White Line and Yellow Zone
    if (infringementType === "White Line Infringement" || infringementType === "Yellow Zone Infringement") {
      document.getElementById("editPenalty").value = "Warning";
    }
  }
  
  // Handle penalty type change to show/hide lap number field
  function handlePenaltyChange() {
    const penaltyType = document.getElementById("editPenalty").value;
    const lapNumberGroup = document.getElementById("lapNumberGroup");
    if (penaltyType === "Lap Invalidation") {
      lapNumberGroup.style.display = "block";
    } else {
      lapNumberGroup.style.display = "none";
      document.getElementById("editLapNumber").value = "";
    }
  }

  // Event listeners
  document.getElementById("searchInput").addEventListener("input", filterTable);
  document.getElementById("filterSelect").addEventListener("change", filterTable);
  document.getElementById("backBtn").addEventListener("click", clearSearch);
  function closeModal() {
    document.getElementById("editModal").classList.remove("show");
    // Reset conditional fields
    document.getElementById("secondKartGroup").style.display = "none";
    document.getElementById("lapNumberGroup").style.display = "none";
    document.getElementById("editSecondKart").value = "";
    document.getElementById("editLapNumber").value = "";
  }
  
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("cancelEdit").addEventListener("click", closeModal);
  document.getElementById("editInfringement").addEventListener("change", handleInfringementChange);
  document.getElementById("editPenalty").addEventListener("change", handlePenaltyChange);

  // Edit form submission
  document.getElementById("editForm").addEventListener("submit", async function(e) {
    e.preventDefault();
    if (!currentEditId) return;

    const infringementType = document.getElementById("editInfringement").value;
    const secondKartNumber = document.getElementById("editSecondKart").value.trim();
    const penaltyType = document.getElementById("editPenalty").value;
    const lapNumber = document.getElementById("editLapNumber").value.trim();
    
    // Format description for "Advantage by Contact" or "Contact" with second kart number
    let finalDescription = infringementType || null;
    if (infringementType && secondKartNumber !== "") {
      const parsedSecondKart = parseInt(secondKartNumber, 10);
      if (!isNaN(parsedSecondKart)) {
        if (infringementType === "Advantage by Contact") {
          finalDescription = "ABC over " + parsedSecondKart;
        } else if (infringementType === "Contact") {
          finalDescription = "Contact over " + parsedSecondKart;
        }
      }
    }
    
    // Format penalty_description for "Lap Invalidation" with lap number
    let finalPenaltyDescription = penaltyType || null;
    if (penaltyType === "Lap Invalidation" && lapNumber !== "") {
      finalPenaltyDescription = "Lap Invalidation - Lap " + lapNumber;
    }

    const observerValue = document.getElementById("editObserver").value.trim();
    
    const payload = {
      kart_number: parseInt(document.getElementById("editKart").value),
      turn_number: document.getElementById("editTurn").value
        ? document.getElementById("editTurn").value.trim()
        : null,
      observer: observerValue === "" ? null : observerValue,
      description: finalDescription,
      penalty_description: finalPenaltyDescription,
      performed_by: observerValue || "Race Control Operator"
    };

    try {
      const response = await fetch(API_BASE + "/infringements/" + currentEditId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        closeModal();
        await refreshTable();
        if (window.opener) {
          window.opener.postMessage({ type: "updateInfringement", id: currentEditId }, "*");
        }
      } else {
        const errorText = await response.text();
        console.error("Update failed:", response.status, errorText);
        alert("Failed to update infringement: " + errorText);
      }
    } catch (error) {
      console.error("Update error:", error);
      alert("Error updating infringement: " + error.message);
    }
  });

  // Listen for messages from parent window
  window.addEventListener("message", async function(e) {
    if (e.data && e.data.type === "updateInfringements") {
      await refreshTable();
    }
  });

  // WebSocket connection for real-time updates
  try {
    // Use same origin (nginx proxy) if API_BASE uses a different port
    // This avoids direct port access which may be blocked
    let wsUrl;
    if (!API_BASE || API_BASE.startsWith('/')) {
      // Relative URL - use same origin
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = protocol + '//' + window.location.host + '/ws';
    } else {
      const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      const apiPortMatch = API_BASE.match(/:(\d+)/);
      const apiPort = apiPortMatch ? apiPortMatch[1] : null;
      
      // If ports differ, use same origin (nginx will proxy)
      if (apiPort && apiPort !== currentPort) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = protocol + '//' + window.location.host + '/ws';
      } else {
        // Otherwise, convert API_BASE to WebSocket URL
        wsUrl = API_BASE.replace(/^http/, "ws").replace(/\\/$/, "") + "/ws";
      }
    }
    
    socket = new WebSocket(wsUrl);
    
    socket.onmessage = function(e) {
      try {
        const message = JSON.parse(e.data);
        if (["new_infringement", "update_infringement", "delete_infringement", "penalty_applied"].includes(message.type)) {
          refreshTable();
        }
      } catch (error) {
        console.error("WS error:", error);
      }
    };
    
    socket.onerror = function(error) {
      console.error("WS error:", error);
    };
    
    socket.onopen = function() {
      console.log("WS connected");
    };
  } catch (error) {
    console.error("WS failed:", error);
  }

  // Initial table load
  console.log("Popup script initialized, API_BASE:", API_BASE);
  refreshTable();

  // Cleanup on window close
  window.addEventListener("beforeunload", function() {
    if (socket) {
      socket.close();
    }
  });
})();
  `;
}
