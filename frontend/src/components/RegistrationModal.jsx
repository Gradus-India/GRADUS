import React, { useState, useEffect } from "react";
import apiClient from "../services/apiClient";
import Select from "react-select";
import { ToastContainer, toast } from 'react-toastify';
import { supabase } from "../services/supabaseClient";

const RegistrationModal = ({ isOpen, onClose, programName, programType, slug, landingPageId, mentorName, date, time, keyBenefit }) => {
    if (!isOpen) return null;

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        state: null,
        qualification: null,
    });

    const [loading, setLoading] = useState(false);

    // Check if masterclass time has passed
    const isMasterclassPast = React.useMemo(() => {
        if (!date || !time) return false;
        try {
            const dateTimeStr = `${date} ${time}`;
            const masterclassDateTime = new Date(dateTimeStr);
            if (isNaN(masterclassDateTime.getTime())) return false;
            return masterclassDateTime.getTime() < new Date().getTime();
        } catch (error) {
            console.warn("Failed to parse masterclass date/time:", error);
            return false;
        }
    }, [date, time]);

    // Focus trap or simple overlay click to close
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    const stateOptions = [
        { value: "Andhra Pradesh", label: "Andhra Pradesh" },
        { value: "Arunachal Pradesh", label: "Arunachal Pradesh" },
        { value: "Assam", label: "Assam" },
        { value: "Bihar", label: "Bihar" },
        { value: "Chhattisgarh", label: "Chhattisgarh" },
        { value: "Goa", label: "Goa" },
        { value: "Gujarat", label: "Gujarat" },
        { value: "Haryana", label: "Haryana" },
        { value: "Himachal Pradesh", label: "Himachal Pradesh" },
        { value: "Jharkhand", label: "Jharkhand" },
        { value: "Karnataka", label: "Karnataka" },
        { value: "Kerala", label: "Kerala" },
        { value: "Madhya Pradesh", label: "Madhya Pradesh" },
        { value: "Maharashtra", label: "Maharashtra" },
        { value: "Manipur", label: "Manipur" },
        { value: "Meghalaya", label: "Meghalaya" },
        { value: "Mizoram", label: "Mizoram" },
        { value: "Nagaland", label: "Nagaland" },
        { value: "Odisha", label: "Odisha" },
        { value: "Punjab", label: "Punjab" },
        { value: "Rajasthan", label: "Rajasthan" },
        { value: "Sikkim", label: "Sikkim" },
        { value: "Tamil Nadu", label: "Tamil Nadu" },
        { value: "Telangana", label: "Telangana" },
        { value: "Tripura", label: "Tripura" },
        { value: "Uttar Pradesh", label: "Uttar Pradesh" },
        { value: "Uttarakhand", label: "Uttarakhand" },
        { value: "West Bengal", label: "West Bengal" },
        // Union Territories
        { value: "Andaman and Nicobar Islands", label: "Andaman and Nicobar Islands" },
        { value: "Chandigarh", label: "Chandigarh" },
        { value: "Dadra and Nagar Haveli and Daman and Diu", label: "Dadra and Nagar Haveli and Daman and Diu" },
        { value: "Delhi", label: "Delhi" },
        { value: "Jammu and Kashmir", label: "Jammu and Kashmir" },
        { value: "Ladakh", label: "Ladakh" },
        { value: "Lakshadweep", label: "Lakshadweep" },
        { value: "Puducherry", label: "Puducherry" },
    ];

    const qualificationOptions = [
        { value: "High School", label: "High School" },
        { value: "Undergraduate", label: "Undergraduate" },
        { value: "Graduate", label: "Graduate" },
        { value: "Post Graduate", label: "Post Graduate" },
        { value: "PhD", label: "PhD" },
        { value: "Other", label: "Other" },
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        
        // Phone number validation: only allow digits, max 10 digits
        if (name === "phone") {
            // Remove any non-digit characters
            const digitsOnly = value.replace(/\D/g, "");
            // Limit to 10 digits
            const limitedDigits = digitsOnly.slice(0, 10);
            setFormData({ ...formData, [name]: limitedDigits });
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleSelectChange = (name, selectedOption) => {
        setFormData({ ...formData, [name]: selectedOption });
    };


    const [isAuthorized, setIsAuthorized] = useState(true);
    const [isSuccess, setIsSuccess] = useState(false);
    const [successEmail, setSuccessEmail] = useState(""); // Track email for success display

    // Track Facebook Pixel Lead event on successful registration
    useEffect(() => {
        if (isSuccess && window.fbq) {
            // Determine which pixel to use based on slug or program type
            const isAkhil = slug === 'akhil' || (programType && programType.toLowerCase().includes('gradus x'));
            const isVaibhav = slug === 'vaibhav' || (programType && programType.toLowerCase().includes('gradus finlit'));

            // Pixel ID for akhil (Gradus X)
            const akhilPixelId = '841851888624467';
            // Pixel ID for vaibhav (will be set later)
            const vaibhavPixelId = ''; // To be provided later

            if (isAkhil) {
                // Track Lead event for akhil (Gradus X) successful registration
                // Pixel is already initialized on page load for akhil slug
                window.fbq('track', 'Lead', {
                    content_name: programName,
                    content_category: 'Gradus X Registration',
                    value: 0.00,
                    currency: 'INR'
                });

                // Also track CompleteRegistration event
                window.fbq('track', 'CompleteRegistration', {
                    content_name: programName,
                    status: true
                });

                console.log('Facebook Pixel: Lead event tracked for akhil (Gradus X) registration');
            } else if (isVaibhav && vaibhavPixelId) {
                // Track Lead event for vaibhav (Gradus FINLIT) successful registration
                // Pixel will be initialized on page load when vaibhav pixel ID is provided
                window.fbq('track', 'Lead', {
                    content_name: programName,
                    content_category: 'Gradus FINLIT Registration',
                    value: 0.00,
                    currency: 'INR'
                });

                // Also track CompleteRegistration event
                window.fbq('track', 'CompleteRegistration', {
                    content_name: programName,
                    status: true
                });

                console.log('Facebook Pixel: Lead event tracked for vaibhav (Gradus FINLIT) registration');
            }
        }
    }, [isSuccess, programName, programType, slug]);

    const handleClose = () => {
        setIsSuccess(false);
        // Remove the registration query param on close, allow others to remain
        const url = new URL(window.location.href);
        url.searchParams.delete("registration");
        window.history.pushState({ path: url.href }, '', url.href);
        onClose();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check if masterclass time has passed
        if (isMasterclassPast) {
            toast.error("Registration is closed. This masterclass has already taken place. Please check our upcoming masterclasses for future events.");
            return;
        }

        if (!isAuthorized) {
            toast.error("Please check the authorization box to proceed with registration.");
            return;
        }

        if (!formData.name || !formData.email || !formData.phone) {
            toast.error("Please fill in all required fields (Name, Email, and Phone) to continue.");
            return;
        }

        // Validate phone number: must be exactly 10 digits
        const phoneDigits = formData.phone.replace(/\D/g, "");
        if (phoneDigits.length !== 10) {
            if (phoneDigits.length === 0) {
                toast.error("Please enter your 10-digit phone number.");
            } else if (phoneDigits.length < 10) {
                toast.error(`Please enter a complete 10-digit phone number. You've entered ${phoneDigits.length} digit${phoneDigits.length > 1 ? 's' : ''}.`);
            } else {
                toast.error("Phone number should be exactly 10 digits. Please check and try again.");
            }
            return;
        }

        setLoading(true);
        try {
            // Clean phone number (add +91 if missing, though user requested default +91 display, input might vary)
            let phone = formData.phone.trim();
            if (!phone.startsWith("+")) {
                phone = "+91" + phone;
            }

            const payload = {
                name: formData.name,
                email: formData.email.trim(),
                phone: phone,
                state: formData.state?.value || null,
                qualification: formData.qualification?.value || null,
                program_name: programName,
                landing_page_id: landingPageId,
                mentor_name: mentorName,
                date: date,
                time: time,
                key_benefit: keyBenefit
            };

            // Send data to backend
            const response = await apiClient.post("/landing-page-registrations", payload);

            // internal check: log if email failed (backend newly configured to return this)
            if (response?.emailStatus === 'failed') {
                console.warn("Registration saved, but email failed:", response.emailError);
            }

            // Store email for success message before clearing form
            const registeredEmail = formData.email;

            setIsSuccess(true);
            setSuccessEmail(registeredEmail); // New state for success message

            setFormData({
                name: "",
                email: "",
                phone: "",
                state: null,
                qualification: null
            });
            // Keep authorized true for next time or reset? User said default check, so keeping it true or resetting to true is fine.
            setIsAuthorized(true);

            // Update URL for ad tracking, preserving existing params
            const url = new URL(window.location.href);
            url.searchParams.set("registration", "success");
            window.history.pushState({ path: url.href }, '', url.href);

        } catch (error) {
            console.error("Registration failed", error);
            // Handle specific error messages from backend with user-friendly formatting
            let errorMessage = error?.message || error?.error || "Oops! Something went wrong. Please try again.";
            
            // Make error messages more user-friendly
            if (errorMessage.includes("already registered")) {
                // Keep the backend message as it's already user-friendly
            } else if (errorMessage.includes("Registration is closed") || errorMessage.includes("already taken place")) {
                // Keep the backend message as it's already user-friendly
            } else if (errorMessage.includes("Phone number must be")) {
                errorMessage = "Please enter a valid 10-digit phone number.";
            } else if (errorMessage.includes("Failed to validate")) {
                errorMessage = "We're having trouble processing your registration. Please try again in a moment.";
            } else if (!errorMessage.includes("already") && !errorMessage.includes("phone") && !errorMessage.includes("email") && !errorMessage.includes("closed")) {
                errorMessage = "We couldn't complete your registration. Please check your details and try again.";
            }
            
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="modal-close" onClick={handleClose}>
                    &times;
                </button>

                {isSuccess ? (
                    <div className="success-view">
                        <div className="success-icon-wrapper">
                            <div className="success-icon">✓</div>
                        </div>
                        <h2 className="modal-title">Registration Successful!</h2>
                        <p className="success-message">
                            Thank you for registering for <strong>{programName}</strong>.
                        </p>
                        <p className="success-subtext">
                            We have sent a confirmation email to <strong>{successEmail}</strong>.
                        </p>
                        <button onClick={handleClose} className="cta-button modal-submit-btn">
                            Close
                        </button>
                    </div>
                ) : (
                    <>
                        <h2 className="modal-title">Register Now</h2>
                        {isMasterclassPast && (
                            <div style={{
                                padding: '12px 16px',
                                backgroundColor: '#fff3cd',
                                border: '1px solid #ffc107',
                                borderRadius: '8px',
                                marginBottom: '20px',
                                color: '#856404'
                            }}>
                                <strong>Registration Closed</strong>
                                <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                                    This masterclass has already taken place. Please check our upcoming masterclasses for future events.
                                </p>
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label>Name *</label>
                                <input
                                    type="text"
                                    name="name"
                                    placeholder="Enter your full name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    disabled={isMasterclassPast}
                                />
                            </div>

                            <div className="form-group">
                                <label>Email *</label>
                                <input
                                    type="email"
                                    name="email"
                                    placeholder="you@email.com"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    disabled={isMasterclassPast}
                                />
                            </div>

                            <div className="form-group">
                                <label>Phone *</label>
                                <div className="phone-input-wrapper">
                                    <span className="phone-prefix">+91</span>
                                    <input
                                        type="tel"
                                        name="phone"
                                        placeholder="WhatsApp number"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        maxLength={10}
                                        pattern="[0-9]{10}"
                                        required
                                        disabled={isMasterclassPast}
                                    />
                                </div>
                            </div>

                            <div className="form-group" style={{ display: 'none' }}>
                                <label>State</label>
                                <Select
                                    options={stateOptions}
                                    value={formData.state}
                                    onChange={(opt) => handleSelectChange("state", opt)}
                                    placeholder="Select state"
                                />
                            </div>

                            <div className="form-group" style={{ display: 'none' }}>
                                <label>Qualification</label>
                                <Select
                                    options={qualificationOptions}
                                    value={formData.qualification}
                                    onChange={(opt) => handleSelectChange("qualification", opt)}
                                    placeholder="Select qualification"
                                    isDisabled={isMasterclassPast}
                                />
                            </div>

                            <div className="form-group checkbox-group">
                                <input
                                    type="checkbox"
                                    id="auth-check"
                                    checked={isAuthorized}
                                    onChange={(e) => setIsAuthorized(e.target.checked)}
                                    disabled={isMasterclassPast}
                                />
                                <label htmlFor="auth-check" style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.4' }}>
                                    I authorize Gradus Team to reach out to me with updates and notifications via Email, SMS, WhatsApp and RCS.
                                </label>
                            </div>

                            <button
                                type="submit"
                                className="cta-button modal-submit-btn"
                                disabled={loading || !isAuthorized || isMasterclassPast}
                                style={{ 
                                    opacity: (isAuthorized && !isMasterclassPast) ? 1 : 0.6, 
                                    cursor: (isAuthorized && !isMasterclassPast) ? 'pointer' : 'not-allowed' 
                                }}
                            >
                                {loading ? "Registering..." : isMasterclassPast ? "Registration Closed" : "Register For Free"}
                            </button>
                        </form>
                    </>
                )}
            </div>

            <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: white;
          padding: 2rem;
          border-radius: 16px;
          width: 90%;
          max-width: 500px;
          position: relative;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .modal-close {
          position: absolute;
          top: 1rem;
          right: 1.5rem;
          background: none;
          border: none;
          font-size: 2rem;
          cursor: pointer;
          color: #666;
          z-index: 10;
        }
        .modal-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          color: #111;
          text-align: center;
        }
        
        /* Success View Styles */
        .success-view {
            text-align: center;
            padding: 1rem 0;
        }
        .success-icon-wrapper {
            width: 80px;
            height: 80px;
            background: #e6f4ea; /* Light Green BG */
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem auto;
        }
        .success-icon {
            font-size: 3rem;
            color: #28a745; /* Success Green */
            line-height: 1;
        }
        .success-message {
            font-size: 1.1rem;
            color: #333;
            margin-bottom: 0.5rem;
        }
        .success-subtext {
            color: #666;
            margin-bottom: 2rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }
        .form-group label {
          display: block;
          font-size: 0.9rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #444;
        }
        .form-group input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }
        .form-group input:focus {
          border-color: #2168f6;
          outline: none;
        }
        .phone-input-wrapper {
          display: flex;
          align-items: center;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
        }
        .phone-input-wrapper:focus-within {
           border-color: #2168f6;
        }
        .phone-prefix {
          background: #f8f9fa;
          padding: 0.75rem 0.5rem 0.75rem 1rem;
          color: #555;
          font-weight: 500;
          border-right: 1px solid #eee;
          white-space: nowrap;
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }
        .phone-input-wrapper input {
          border: none;
          border-radius: 0;
        }
        .phone-input-wrapper input:focus {
          border-color: transparent;
        }
        .checkbox-group {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          margin-top: 1rem;
        }
        .checkbox-group input {
          width: auto;
          margin-top: 0.2rem;
        }
        .modal-submit-btn {
          width: 100%;
          margin-top: 1rem;
          border: none;
          cursor: pointer;
        }
        /* Green Theme Overrides for Modal */
        .theme-green .modal-content .modal-submit-btn,
        .theme-green .phone-input-wrapper:focus-within,
        .theme-green .form-group input:focus {
             /* Green theme styles are inherited via css class if wrapper has it */
        }
      `}</style>
        </div>
    );
};

export default RegistrationModal;
