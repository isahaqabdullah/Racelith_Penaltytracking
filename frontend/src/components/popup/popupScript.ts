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

  // Generate table row HTML for an infringement
  function generateRowHTML(inf) {
    const id = escapeHtml(inf.id.toString());
    const kartNum = escapeHtml(inf.kart_number.toString());
    const time = escapeHtml(formatTime(inf.timestamp));
    const turn = inf.turn_number ? escapeHtml(inf.turn_number.toString()) : "—";
    const description = escapeHtml(inf.description || "");
    const penalty = inf.penalty_description ? escapeHtml(inf.penalty_description) : "—";
    const observer = inf.observer ? escapeHtml(inf.observer) : "—";
    const status = escapeHtml(getStatus(inf));
    const statusClass = getStatus(inf).toLowerCase();

    const editIcon = '<svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>';
    const deleteIcon = '<svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';

    return '<tr data-kart="' + kartNum + '" data-id="' + id + '">' +
      '<td>' + time + '</td>' +
      '<td>' + kartNum + '</td>' +
      '<td>' + turn + '</td>' +
      '<td>' + description + '</td>' +
      '<td>' + penalty + '</td>' +
      '<td>' + observer + '</td>' +
      '<td><span class="badge badge-' + statusClass + '">' + status + '</span></td>' +
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
      console.log("Fetching from:", API_BASE + "/infringements/");
      const response = await fetch(API_BASE + "/infringements/");
      if (!response.ok) {
        throw new Error("Failed: " + response.status + " " + response.statusText);
      }

      const data = await response.json();
      console.log("Fetched data:", data.length, "infringements");
      const searchInput = document.getElementById("searchInput");
      const backBtn = document.getElementById("backBtn");
      const searchValue = searchInput ? searchInput.value.trim() : "";

      // Show/hide back button based on search
      if (backBtn) {
        if (searchValue) {
          backBtn.classList.add("show");
        } else {
          backBtn.classList.remove("show");
        }
      }

      // Filter by kart number (exact match)
      const filtered = searchValue
        ? data.filter(inf => {
            const kartNum = inf.kart_number.toString();
            return kartNum === searchValue || Number(kartNum) === Number(searchValue);
          })
        : data;

      if (filtered.length === 0) {
        const message = searchValue
          ? "No infringements found for kart #" + escapeHtml(searchValue)
          : "No infringements logged yet";
        tbody.innerHTML = '<tr><td colspan="8" class="empty">' + message + '</td></tr>';
      } else {
        tbody.innerHTML = filtered.map(generateRowHTML).join("");
      }
    } catch (error) {
      console.error("Refresh error:", error);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">Error: ' + escapeHtml(error.message || "Unknown") + '</td></tr>';
      }
    }
  }

  // Filter table on search input
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
      const response = await fetch(API_BASE + "/infringements/");
      if (!response.ok) {
        throw new Error("Failed to fetch");
      }

      const data = await response.json();
      const inf = data.find(i => i.id === Number(id) || i.id === id);
      
      if (!inf) {
        throw new Error("Infringement not found");
      }

      currentEditId = Number(id);
      document.getElementById("editKart").value = inf.kart_number || "";
      document.getElementById("editTurn").value = inf.turn_number || "";
      document.getElementById("editObserver").value = inf.observer || "";
      document.getElementById("editInfringement").value = inf.description || "";
      document.getElementById("editPenalty").value = inf.penalty_description || "";
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

  // Event listeners
  document.getElementById("searchInput").addEventListener("input", filterTable);
  document.getElementById("backBtn").addEventListener("click", clearSearch);
  document.getElementById("closeModal").addEventListener("click", function() {
    document.getElementById("editModal").classList.remove("show");
  });
  document.getElementById("cancelEdit").addEventListener("click", function() {
    document.getElementById("editModal").classList.remove("show");
  });

  // Edit form submission
  document.getElementById("editForm").addEventListener("submit", async function(e) {
    e.preventDefault();
    if (!currentEditId) return;

    const payload = {
      kart_number: parseInt(document.getElementById("editKart").value),
      turn_number: document.getElementById("editTurn").value
        ? parseInt(document.getElementById("editTurn").value)
        : null,
      observer: document.getElementById("editObserver").value,
      description: document.getElementById("editInfringement").value,
      penalty_description: document.getElementById("editPenalty").value,
      performed_by: "Race Control Operator"
    };

    try {
      const response = await fetch(API_BASE + "/infringements/" + currentEditId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        document.getElementById("editModal").classList.remove("show");
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

