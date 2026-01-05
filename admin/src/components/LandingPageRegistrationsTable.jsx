import { useEffect, useMemo, useState } from "react";
import useAuth from "../hook/useAuth";
import apiClient from "../services/apiClient";
import { syncLandingPageRegistrationsToSheet, sendLandingPageRegistrationReminders, updateLandingPageRegistration, deleteLandingPageRegistration } from "../services/adminInquiries";
import { toast } from "react-toastify";
import * as XLSX from "xlsx";

const formatDateTime = (value) => {
    if (!value) {
        return "—";
    }
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
};

const LandingPageRegistrationsTable = () => {
    const { token } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [pageFilter, setPageFilter] = useState("all");
    const [sheetSyncing, setSheetSyncing] = useState(false);
    const [sheetSyncingAll, setSheetSyncingAll] = useState(false);
    const [sendingReminders, setSendingReminders] = useState(false);
    const [actionMessage, setActionMessage] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", qualification: "" });
    const [deletingId, setDeletingId] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let isActive = true;

        const load = async () => {
            if (!token) {
                setItems([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const response = await apiClient("/admin/landing-pages/registrations", { token });

                if (isActive) {
                    const nextItems = response?.items || [];
                    setItems(nextItems);
                }
            } catch (err) {
                if (isActive) {
                    setError(err?.message || "Failed to load registrations");
                    setItems([]);
                }
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            isActive = false;
        };
    }, [token, reloadKey]);

    const pageOptions = useMemo(() => {
        const names = new Set();
        items.forEach((item) => {
            if (item.landing_pages?.title) {
                names.add(item.landing_pages.title);
            } else if (item.program_name) {
                names.add(item.program_name);
            }
        });
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [items]);

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase();

        const byEvent =
            pageFilter === "all"
                ? items
                : items.filter((item) => {
                    const title = item.landing_pages?.title || item.program_name;
                    return typeof title === "string" && title.toLowerCase() === pageFilter.toLowerCase();
                });

        const bySearch = term
            ? byEvent.filter((item) => {
                const fields = [
                    item.name,
                    item.email,
                    item.phone,
                    item.qualification,
                    item.program_name,
                    item.landing_pages?.title
                ];

                return fields.some((field) => (typeof field === "string" ? field.toLowerCase().includes(term) : false));
            })
            : byEvent;

        return bySearch;
    }, [items, search, pageFilter]);

    const totalRegistrations = items.length;

    const handleExportToExcel = () => {
        // Prepare data for export
        const exportData = filteredItems.map((item) => ({
            "Name": item.name || "",
            "Email": item.email || "",
            "Phone": item.phone || "",
            "Source Page": item.landing_pages?.title || item.program_name || "Unknown",
            "Qualification": item.qualification || "",
            "Registration Date": item.created_at ? formatDateTime(item.created_at) : ""
        }));

        // Create a new workbook
        const wb = XLSX.utils.book_new();
        
        // Create a worksheet from the data
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Set column widths for better readability
        const colWidths = [
            { wch: 25 }, // Name
            { wch: 30 }, // Email
            { wch: 15 }, // Phone
            { wch: 30 }, // Source Page
            { wch: 20 }, // Qualification
            { wch: 25 }  // Registration Date
        ];
        ws['!cols'] = colWidths;

        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(wb, ws, "Registrations");

        // Generate filename with current date
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `landing-page-registrations-${dateStr}.xlsx`;

        // Write the file and trigger download
        XLSX.writeFile(wb, filename);
    };

    const handleSyncSheetsAll = async () => {
        if (!token) {
            return;
        }

        if (!filteredItems.length) {
            setActionMessage({
                type: "danger",
                text: "No registrations available to sync.",
            });
            return;
        }

        const confirmed = window.confirm(
            "Sync ALL registrations to Google Sheets? Each spreadsheet will be named after the program/landing page."
        );
        if (!confirmed) {
            return;
        }

        setSheetSyncingAll(true);
        setActionMessage(null);

        try {
            const response = await syncLandingPageRegistrationsToSheet({
                token,
                registrationIds: [], // empty means sync everything
            });
            const synced = typeof response?.synced === "number" ? response.synced : filteredItems.length;
            setActionMessage({
                type: "success",
                text:
                    response?.message ||
                    `Queued ${synced} registration(s) for Google Sheets sync. They will be processed shortly.`,
            });
        } catch (err) {
            setActionMessage({
                type: "danger",
                text: err?.message || "Failed to sync registrations to Google Sheets.",
            });
        } finally {
            setSheetSyncingAll(false);
        }
    };

    const handleSendReminders = async () => {
        if (!token) {
            return;
        }

        if (!filteredItems.length) {
            setActionMessage({
                type: "danger",
                text: "No registrations available to send reminders.",
            });
            return;
        }

        const confirmed = window.confirm(
            `Send reminder emails to ${filteredItems.length} registration(s)?`
        );
        if (!confirmed) {
            return;
        }

        setSendingReminders(true);
        setActionMessage(null);

        try {
            const registrationIds = filteredItems.map(item => item.id);
            const response = await sendLandingPageRegistrationReminders({
                token,
                registrationIds,
            });
            
            const sent = typeof response?.sent === "number" ? response.sent : filteredItems.length;
            const failed = typeof response?.failed === "number" ? response.failed : 0;
            const skipped = typeof response?.skipped === "number" ? response.skipped : 0;
            
            if (failed === 0 && skipped === 0) {
                setActionMessage({
                    type: "success",
                    text: response?.message || `Reminders sent to ${sent} registration(s).`,
                });
            } else if (failed === 0) {
                setActionMessage({
                    type: "info",
                    text: response?.message || `Sent ${sent} reminder(s). ${skipped} email(s) skipped (invalid addresses).`,
                });
            } else {
                setActionMessage({
                    type: "warning",
                    text: response?.message || `Sent ${sent} email(s). ${failed} failed. ${skipped > 0 ? `${skipped} skipped.` : ''}`,
                });
            }
        } catch (err) {
            setActionMessage({
                type: "danger",
                text: err?.message || "Failed to send reminder emails.",
            });
        } finally {
            setSendingReminders(false);
        }
    };

    const handleEdit = (item) => {
        setEditingId(item.id);
        setEditForm({
            name: item.name || "",
            email: item.email || "",
            phone: item.phone?.replace(/^\+91/, "") || "",
            qualification: item.qualification || "",
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditForm({ name: "", email: "", phone: "", qualification: "" });
    };

    const handleSaveEdit = async () => {
        if (!token || !editingId) return;

        // Validate
        if (!editForm.name || !editForm.email || !editForm.phone) {
            toast.error("Please fill in all required fields (Name, Email, Phone)");
            return;
        }

        const phoneDigits = editForm.phone.replace(/\D/g, "");
        if (phoneDigits.length !== 10) {
            toast.error("Phone number must be exactly 10 digits");
            return;
        }

        try {
            await updateLandingPageRegistration({
                token,
                registrationId: editingId,
                data: {
                    name: editForm.name,
                    email: editForm.email,
                    phone: editForm.phone,
                    qualification: editForm.qualification || null,
                },
            });
            toast.success("Registration updated successfully");
            setEditingId(null);
            setEditForm({ name: "", email: "", phone: "", qualification: "" });
            setReloadKey(prev => prev + 1);
        } catch (err) {
            toast.error(err?.message || "Failed to update registration");
        }
    };

    const handleDelete = async (id) => {
        if (!token || !id) return;
        
        const confirmed = window.confirm("Are you sure you want to delete this registration? This action cannot be undone.");
        if (!confirmed) return;

        setDeletingId(id);
        try {
            await deleteLandingPageRegistration({ token, registrationId: id });
            toast.success("Registration deleted successfully");
            setReloadKey(prev => prev + 1);
        } catch (err) {
            toast.error(err?.message || "Failed to delete registration");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className='card h-100 p-0 radius-12 overflow-hidden'>
            <div className='card-header border-bottom bg-base py-16 px-24'>
                <div className='d-flex flex-wrap gap-12 justify-content-between align-items-center'>
                    <div>
                        <h6 className='text-lg fw-semibold mb-1'>Landing Page Registrations</h6>
                        <p className='text-sm text-secondary-light mb-0'>
                            Total: {totalRegistrations}
                        </p>
                    </div>
                    <div className='d-flex flex-wrap gap-12 ms-auto align-items-center'>
                        <button
                            type='button'
                            className='btn btn-info btn-sm'
                            onClick={handleSendReminders}
                            disabled={sendingReminders || loading || filteredItems.length === 0}
                            title='Send reminder emails to filtered registrations'
                        >
                            <i className='ph ph-envelope' style={{ marginRight: '6px' }}></i>
                            {sendingReminders ? "Sending..." : "Send Reminders"}
                        </button>
                        <button
                            type='button'
                            className='btn btn-success btn-sm'
                            onClick={handleSyncSheetsAll}
                            disabled={sheetSyncingAll || loading || filteredItems.length === 0}
                            title='Sync all registrations to Google Sheets'
                        >
                            <i className='ph ph-google-logo' style={{ marginRight: '6px' }}></i>
                            {sheetSyncingAll ? "Syncing..." : "Sync to Sheets"}
                        </button>
                        <button
                            type='button'
                            className='btn btn-primary btn-sm'
                            onClick={handleExportToExcel}
                            disabled={loading || filteredItems.length === 0}
                            title='Export to Excel'
                        >
                            <i className='ph ph-download' style={{ marginRight: '6px' }}></i>
                            Export Excel
                        </button>
                        <input
                            type='search'
                            className='form-control form-control-sm'
                            placeholder='Search...'
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            style={{ maxWidth: 200 }}
                        />
                        <select
                            className='form-select form-select-sm'
                            value={pageFilter}
                            onChange={(event) => setPageFilter(event.target.value)}
                            style={{ maxWidth: 200 }}
                            title='Filter by Landing Page'
                        >
                            <option value='all'>All Pages</option>
                            {pageOptions.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            <div className='card-body p-24'>
                {actionMessage ? (
                    <div className={`alert alert-${actionMessage.type === "danger" ? "danger" : "success"} mb-3`}>
                        {actionMessage.text}
                    </div>
                ) : null}
                {error ? (
                    <div className='alert alert-danger mb-0'>{error}</div>
                ) : loading ? (
                    <div className='d-flex justify-content-center py-48'>
                        <div className='spinner-border text-primary' role='status'>
                            <span className='visually-hidden'>Loading...</span>
                        </div>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className='alert alert-info mb-0'>
                        No registration data found.
                    </div>
                ) : (
                    <div className='table-responsive'>
                        <table className='table align-middle mb-0' style={{ minWidth: "1000px" }}>
                            <thead>
                                <tr>
                                    <th scope="col" style={{ minWidth: "150px" }}>Name</th>
                                    <th scope="col" style={{ minWidth: "200px" }}>Email</th>
                                    <th scope="col" style={{ minWidth: "120px" }}>Phone</th>
                                    <th scope="col" style={{ minWidth: "180px" }}>Source Page</th>
                                    <th scope="col" style={{ minWidth: "150px" }}>Date</th>
                                    <th scope="col" style={{ width: "120px", textAlign: "center" }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map((item) => (
                                    <tr key={item.id}>
                                        <td style={{ verticalAlign: "middle" }}>
                                            {editingId === item.id ? (
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={editForm.name}
                                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                                    placeholder="Name"
                                                    style={{ minWidth: "140px" }}
                                                />
                                            ) : (
                                                <span className="fw-medium">{item.name || "—"}</span>
                                            )}
                                        </td>
                                        <td style={{ verticalAlign: "middle" }}>
                                            {editingId === item.id ? (
                                                <input
                                                    type="email"
                                                    className="form-control form-control-sm"
                                                    value={editForm.email}
                                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                                    placeholder="Email"
                                                    style={{ minWidth: "190px" }}
                                                />
                                            ) : (
                                                <span className="text-break">{item.email || "—"}</span>
                                            )}
                                        </td>
                                        <td style={{ verticalAlign: "middle" }}>
                                            {editingId === item.id ? (
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={editForm.phone}
                                                    onChange={(e) => {
                                                        const value = e.target.value.replace(/\D/g, "").slice(0, 10);
                                                        setEditForm({ ...editForm, phone: value });
                                                    }}
                                                    placeholder="Phone"
                                                    maxLength={10}
                                                    style={{ minWidth: "110px" }}
                                                />
                                            ) : (
                                                <span>{item.phone || "—"}</span>
                                            )}
                                        </td>
                                        <td style={{ verticalAlign: "middle" }}>
                                            {editingId === item.id ? (
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={editForm.qualification}
                                                    onChange={(e) => setEditForm({ ...editForm, qualification: e.target.value })}
                                                    placeholder="Qualification"
                                                    style={{ minWidth: "170px" }}
                                                />
                                            ) : (
                                                <div>
                                                    {item.landing_pages?.title ? (
                                                        <span className="badge bg-primary-subtle text-primary fw-medium px-3 py-1">{item.landing_pages.title}</span>
                                                    ) : (
                                                        <span className="text-muted">{item.program_name || "Unknown"}</span>
                                                    )}
                                                    {item.qualification && (
                                                        <div className="text-muted small mt-1">{item.qualification}</div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ verticalAlign: "middle" }}>{formatDateTime(item.created_at)}</td>
                                        <td style={{ verticalAlign: "middle", textAlign: "center" }}>
                                            {editingId === item.id ? (
                                                <div className="d-flex gap-2">
                                                    <button
                                                        type="button"
                                                        className="btn btn-success btn-sm"
                                                        onClick={handleSaveEdit}
                                                        title="Save"
                                                    >
                                                        <i className="ph ph-check"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={handleCancelEdit}
                                                        title="Cancel"
                                                    >
                                                        <i className="ph ph-x"></i>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="d-flex gap-2">
                                                    <button
                                                        type="button"
                                                        className="btn btn-info btn-sm"
                                                        onClick={() => handleEdit(item)}
                                                        title="Edit"
                                                    >
                                                        <i className="ph ph-pencil"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleDelete(item.id)}
                                                        disabled={deletingId === item.id}
                                                        title="Delete"
                                                    >
                                                        {deletingId === item.id ? (
                                                            <span className="spinner-border spinner-border-sm" role="status"></span>
                                                        ) : (
                                                            <i className="ph ph-trash"></i>
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LandingPageRegistrationsTable;
