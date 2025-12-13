/**
 * CSS styles for the infringement log popup window
 */
export const popupStyles = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
  padding: 20px; 
  background: #f5f5f5; 
}
.container { 
  background: white; 
  border-radius: 8px; 
  padding: 24px; 
  box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
}
.header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 20px; 
}
h1 { 
  font-size: 24px; 
  font-weight: 600; 
  color: #1a1a1a; 
}
.search-container { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
}
.search-input { 
  padding: 8px 12px; 
  border: 1px solid #d1d5db; 
  border-radius: 6px; 
  font-size: 14px; 
  width: 160px; 
}
.search-input:focus { 
  outline: none; 
  border-color: #3b82f6; 
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); 
}
.back-btn { 
  padding: 6px 12px; 
  border: 1px solid #d1d5db; 
  border-radius: 6px; 
  background: white; 
  font-size: 12px; 
  cursor: pointer; 
  display: none; 
}
.back-btn:hover { 
  background: #f9fafb; 
}
.back-btn.show { 
  display: block; 
}
.filter-select { 
  padding: 8px 12px; 
  border: 1px solid #d1d5db; 
  border-radius: 6px; 
  font-size: 14px; 
  background: white; 
  cursor: pointer; 
}
.filter-select:focus { 
  outline: none; 
  border-color: #3b82f6; 
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); 
}
table { 
  width: 100%; 
  border-collapse: collapse; 
}
th { 
  background: #f8f9fa; 
  padding: 12px; 
  text-align: left; 
  font-weight: 600; 
  font-size: 12px; 
  text-transform: uppercase; 
  color: #6b7280; 
  border-bottom: 2px solid #e5e7eb; 
}
td { 
  padding: 12px; 
  border-bottom: 1px solid #e5e7eb; 
  font-size: 14px; 
  color: #1a1a1a; 
}
tr:hover { 
  background: #f9fafb; 
}
.badge { 
  display: inline-flex; 
  align-items: center; 
  justify-content: center; 
  border-radius: 6px; 
  border: 1px solid; 
  padding: 2px 8px; 
  font-size: 12px; 
  font-weight: 500; 
}
.badge-applied { 
  background: #16a34a; 
  color: #ffffff; 
  border-color: transparent; 
}
.badge-expired { 
  background: #f3f4f6; 
  color: #374151; 
  border-color: #d1d5db; 
}
.badge-warning { 
  background: #eab308; 
  color: #ffffff; 
  border-color: transparent; 
}
.badge-pending { 
  background: #dc2626; 
  color: #ffffff; 
  border-color: transparent; 
}
.badge-cleared { 
  background: transparent; 
  color: #1a1a1a; 
  border-color: #d1d5db; 
}
.empty { 
  text-align: center; 
  padding: 40px; 
  color: #6b7280; 
}
.actions { 
  display: flex; 
  gap: 8px; 
  justify-content: flex-end; 
}
.btn { 
  padding: 6px 12px; 
  border: none; 
  border-radius: 4px; 
  font-size: 12px; 
  cursor: pointer; 
  display: inline-flex; 
  align-items: center; 
  gap: 4px; 
}
.btn-edit { 
  background: #f3f4f6; 
  color: #374151; 
}
.btn-edit:hover { 
  background: #e5e7eb; 
}
.btn-delete { 
  background: #fee2e2; 
  color: #991b1b; 
}
.btn-delete:hover { 
  background: #fecaca; 
}
.btn-icon { 
  width: 14px; 
  height: 14px; 
}
.modal { 
  display: none; 
  position: fixed; 
  top: 0; 
  left: 0; 
  width: 100%; 
  height: 100%; 
  background: rgba(0,0,0,0.5); 
  z-index: 1000; 
  align-items: center; 
  justify-content: center; 
}
.modal.show { 
  display: flex; 
}
.modal-content { 
  background: white; 
  padding: 24px; 
  border-radius: 8px; 
  max-width: 500px; 
  width: 90%; 
  max-height: 90vh; 
  overflow-y: auto; 
}
.modal-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 20px; 
}
.modal-title { 
  font-size: 18px; 
  font-weight: 600; 
}
.modal-close { 
  background: none; 
  border: none; 
  font-size: 24px; 
  cursor: pointer; 
  color: #6b7280; 
}
.modal-close:hover { 
  color: #1a1a1a; 
}
.form-group { 
  margin-bottom: 16px; 
}
.form-label { 
  display: block; 
  margin-bottom: 6px; 
  font-size: 14px; 
  font-weight: 500; 
}
.form-input { 
  width: 100%; 
  padding: 8px 12px; 
  border: 1px solid #d1d5db; 
  border-radius: 6px; 
  font-size: 14px; 
}
.form-select { 
  width: 100%; 
  padding: 8px 12px; 
  border: 1px solid #d1d5db; 
  border-radius: 6px; 
  font-size: 14px; 
  background: white; 
}
.modal-footer { 
  display: flex; 
  gap: 8px; 
  justify-content: flex-end; 
  margin-top: 24px; 
}
.btn-primary { 
  background: #3b82f6; 
  color: white; 
}
.btn-primary:hover { 
  background: #2563eb; 
}
.btn-secondary { 
  background: #f3f4f6; 
  color: #374151; 
}
.btn-secondary:hover { 
  background: #e5e7eb; 
}
`;

