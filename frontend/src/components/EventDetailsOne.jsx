import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { submitEventRegistration } from "../services/contactService";
import { useAuth } from "../context/AuthContext";

const STATE_OPTIONS = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal"
];

const QUALIFICATION_OPTIONS = ["UG Pursuing", "UG Completed", "PG Pursuing", "PG Completed"];

const TABS = [
  { id: "overview", icon: "ph-squares-four", label: "Overview" },
  { id: "instructor", icon: "ph-user-circle", label: "Instructor" },
  { id: "help", icon: "ph-headset", label: "Help" },
];

const formatDate = (iso) => {
  if (!iso) return "TBA";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "TBA";
  }
};

const formatTime = (iso, timezone) => {
  if (!iso) return "TBA";
  try {
    return `${new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso))} ${timezone || ""}`.trim();
  } catch {
    return "TBA";
  }
};

const EventTabs = ({ active, onChange }) => (
  <div className='event-tabs'>
    {TABS.map((tab) => (
      <button
        key={tab.id}
        type='button'
        className={`event-tab ${active === tab.id ? "is-active" : ""}`}
        onClick={() => onChange(tab.id)}
      >
        <i className={`ph ${tab.icon}`} aria-hidden />
        {tab.label}
      </button>
    ))}
  </div>
);

const OverviewTab = ({ event, overviewText }) => {
  const eventTypeLabel = event?.eventType || "Live session";
  const paragraphs = overviewText
    ? overviewText
      .split(/\n+/)
      .map((text) => text.trim())
      .filter(Boolean)
    : [];

  return (
    <div className='event-overview'>

      {paragraphs.map((text, index) => (
        <p key={index} className='text-neutral-600 mb-24'>
          {text}
        </p>
      ))}
      {/* 1. Why It Matters (from Masterclass Details) */}
      {event?.masterclassDetails?.overview?.whyMatters?.title ? (
        <div className='mb-5'>
          <h3 className='event-section-title'>
            {event.masterclassDetails.overview.whyMatters.title}
          </h3>
          <p className='text-neutral-600 mb-0'>
            {event.masterclassDetails.overview.whyMatters.description}
          </p>
        </div>
      ) : null}

      {/* 2. Who Is This For (from Masterclass Details) */}
      {event?.masterclassDetails?.overview?.whoIsFor?.length ? (
        <div className='mb-5'>
          <h3 className='event-section-title'>Who is this for?</h3>
          <div className='row g-3'>
            {event.masterclassDetails.overview.whoIsFor.map((item, idx) => (
              <div key={idx} className='col-md-6'>
                <div className='d-flex align-items-start gap-3 h-100'>
                  <span className='d-flex align-items-center justify-content-center w-24 h-24 rounded-circle bg-success-100 text-success-600 flex-shrink-0'>
                    <i className='ph-bold ph-check' style={{ fontSize: "14px" }} />
                  </span>
                  <span className='text-neutral-700 fw-medium'>{item}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 3. Outcomes / Highlights */}
      {/* 3. Outcomes / Highlights */}
      <h2 className='event-section-title'>What you will learn in this event</h2>
      {event?.meta?.highlights?.length ? (
        <ul className='event-highlight-list'>
          {event.meta.highlights.map((item, index) => (
            <li key={`highlight-${index}`}>{item}</li>
          ))}
        </ul>
      ) : event?.masterclassDetails?.overview?.outcomes?.length ? (
        <ul className='event-highlight-list'>
          {event.masterclassDetails.overview.outcomes.map((item, index) => (
            <li key={`outcome-${index}`}>{item}</li>
          ))}
        </ul>
      ) : null}

      {/* 4. Agenda */}
      {event?.meta?.agenda?.length ? (
        <div className='event-agenda mt-40'>
          <h4 className='mb-16'>Agenda</h4>
          <ol className='event-agenda__list'>
            {event.meta.agenda.map((item, index) => (
              <li key={`agenda-${index}`}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
};

const InstructorTab = ({ event }) => {
  const name = event?.host?.name;
  const title = event?.host?.title;
  const bio = event?.host?.bio;
  const photoUrl = event?.host?.avatarUrl;
  const hasPhoto = Boolean(photoUrl);
  // Only render if we have at least a name
  if (!name) return null;

  const layoutClass = `event-instructor-layout${hasPhoto ? "" : " event-instructor-layout--no-photo"}`;

  return (
    <div className='event-overview'>
      <div className={layoutClass}>
        {hasPhoto ? (
          <div className='event-instructor__media'>
            <img
              className='event-instructor__photo'
              src={photoUrl}
              alt={name}
              loading='lazy'
            />
          </div>
        ) : null}
        <div className='event-instructor__details'>
          <h3 className='event-instructor__name'>{name}</h3>
          {title ? <p className='text-neutral-500 mb-12'>{title}</p> : null}
          <p className='event-instructor__bio text-neutral-600'>{bio}</p>
        </div>
      </div>
    </div>
  );
};

const HelpTab = ({ event }) => {
  const email = event?.meta?.support?.email || "contact@gradusindia.in";
  const phone = event?.meta?.support?.phone || "+91 84484 29040";
  const phoneLink = phone.replace(/[^0-9+]/g, "");

  return (
    <div className='event-overview'>
      <h2 className='event-section-title'>Need assistance?</h2>
      <p className='text-neutral-600 mb-16'>
        Reach our learner success team if you have questions about enrolment, prerequisites, or need a
        custom corporate cohort.
      </p>
      <ul className='event-highlight-list'>
        <li>Email: <a href={`mailto:${email}`}>{email}</a></li>
        <li>Phone / WhatsApp: <a href={`tel:${phoneLink}`}>{phone}</a></li>
        <li>
          Support Center:{" "}
          <Link to='/support' className='text-main-600'>
            Open a ticket
          </Link>
        </li>
      </ul>
    </div>
  );
};

const isWithinJoinWindow = (event) => {
  const startValue = event?.schedule?.start || null;
  if (!startValue) return false;
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return false;
  const now = Date.now();
  const startMs = start.getTime();
  const windowAfterMs = 30 * 60 * 1000; // 30 minutes after start
  return now >= startMs && now <= startMs + windowAfterMs;
};

const RegistrationCard = ({ event }) => {
  const { user } = useAuth(); // Get logged-in user
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    state: "",
    qualification: "",
    consent: false,
  });
  const [status, setStatus] = useState({ submitting: false, success: false, error: null });
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Auto-fill form and prevent editing if logged in
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        name: user.full_name || user.name || prev.name,
        email: user.email || prev.email,
        phone: user.phone || user.whatsapp_number || prev.phone,
        state: user.state || prev.state,
        qualification: user.qualification || prev.qualification,
      }));
    }
  }, [user]);

  const { dateLabel, timeLabel, isPast } = useMemo(() => {
    const startIso = event?.schedule?.start;
    const now = Date.now();
    const startMs = startIso ? new Date(startIso).getTime() : null;
    return {
      dateLabel: formatDate(startIso),
      timeLabel: formatTime(startIso, event?.schedule?.timezone),
      isPast: startMs ? now > startMs : false,
    };
  }, [event?.schedule?.start, event?.schedule?.timezone]);

  const joinUrl = event?.cta?.url?.trim();
  const liveWindow = isWithinJoinWindow(event);

  const isFormComplete = () =>
    form.name && form.email && form.phone && form.state && form.qualification && form.consent;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const submitRegistration = async () => {
    await submitEventRegistration({
      name: form.name,
      email: form.email,
      phone: form.phone,
      state: form.state,
      course: event?.title || "Event",
      message: `Interested in ${event?.title || "event"} event`,
      qualification: form.qualification,
      consent: form.consent,
      eventDetails: {
        id: event?.id || event?._id || null,
        slug: event?.slug || "",
        title: event?.title || "",
        schedule: {
          start: event?.schedule?.start || null,
          timezone: event?.schedule?.timezone || "",
        },
        hostName: event?.host?.name || "",
        ctaUrl: event?.cta?.url || "",
      },
    });
  };

  const resetForm = () => {
    // If logged in, we reset to USER data, otherwise empty
    if (user) {
      setForm({
        name: user.full_name || user.name || "",
        email: user.email || "",
        phone: user.phone || user.whatsapp_number || "",
        state: user.state || "",
        qualification: user.qualification || "",
        consent: false
      });
    } else {
      setForm({
        name: "",
        email: "",
        phone: "",
        state: "",
        qualification: "",
        consent: false,
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormComplete()) {
      setStatus((prev) => ({ ...prev, error: "Please complete all required fields." }));
      return;
    }

    try {
      setStatus({ submitting: true, success: false, error: null });
      setShowSuccessModal(false);
      await submitRegistration();
      setStatus({ submitting: false, success: true, error: null });
      resetForm();
      setShowSuccessModal(true);
    } catch (err) {
      setStatus({
        submitting: false,
        success: false,
        error: err?.message || "Failed to register interest",
      });
    }
  };

  const handleJoinNow = async () => {
    if (!isFormComplete()) {
      setStatus((prev) => ({ ...prev, error: "Please complete all required fields to join." }));
      return;
    }
    if (!joinUrl) {
      setStatus((prev) => ({ ...prev, error: "Join link is unavailable right now." }));
      return;
    }
    try {
      setStatus({ submitting: true, success: false, error: null });
      await submitRegistration();
      resetForm();
      setStatus({ submitting: false, success: true, error: null });
      window.open(joinUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setStatus({
        submitting: false,
        success: false,
        error: err?.message || "Unable to join right now. Please try again.",
      });
    }
  };

  return (
    <aside className='event-register-card'>
      <div className='event-register-card__thumb'>
        <img
          src={event?.heroImage?.url || "/assets/images/thumbs/event-img1.png"}
          alt={event?.heroImage?.alt || event?.title || "Event"}
          loading='lazy'
        />
      </div>
      <div className={`event-register-card__slot ${isPast ? "bg-danger-50 text-danger-600" : ""}`}>
        <i className='ph ph-info' />
        <span>
          {isPast ? "This event has ended" : `Upcoming slot is ${dateLabel} at ${timeLabel}`}
        </span>
      </div>
      <form className='event-register-card__form' id='event-register-form' onSubmit={handleSubmit}>
        <fieldset disabled={isPast} className='border-0 p-0 m-0'>
          <label className='form-label text-sm fw-semibold'>Name *</label>
          <div className="input-group">
            <input
              className={`form-control ${user?.name || user?.full_name ? "bg-light text-muted" : ""}`}
              name='name'
              value={form.name}
              onChange={handleChange}
              placeholder='Enter your full name'
              required
              readOnly={!!(user?.name || user?.full_name)}
              title={user ? "Name fetched from your profile" : ""}
            />
            {user?.name || user?.full_name ? (
              <span className="input-group-text bg-light border-start-0 text-muted">
                <i className="ph ph-lock-key"></i>
              </span>
            ) : null}
          </div>

          <label className='form-label text-sm fw-semibold mt-16'>Email *</label>
          <div className="input-group">
            <input
              className={`form-control ${user?.email ? "bg-light text-muted" : ""}`}
              type='email'
              name='email'
              value={form.email}
              onChange={handleChange}
              placeholder='you@email.com'
              required
              readOnly={!!user?.email}
              title={user ? "Email fetched from your profile" : ""}
            />
            {user?.email ? (
              <span className="input-group-text bg-light border-start-0 text-muted">
                <i className="ph ph-lock-key"></i>
              </span>
            ) : null}
          </div>

          <label className='form-label text-sm fw-semibold mt-16'>Phone *</label>
          <div className="input-group">
            <input
              className={`form-control ${user?.phone || user?.whatsapp_number ? "bg-light text-muted" : ""}`}
              name='phone'
              value={form.phone}
              onChange={handleChange}
              placeholder='WhatsApp number'
              required
              readOnly={!!(user?.phone || user?.whatsapp_number)}
              title={user ? "Phone fetched from your profile" : ""}
            />
            {user?.phone || user?.whatsapp_number ? (
              <span className="input-group-text bg-light border-start-0 text-muted">
                <i className="ph ph-lock-key"></i>
              </span>
            ) : null}
          </div>

          <label className='form-label text-sm fw-semibold mt-16'>State *</label>
          <select
            className='form-select'
            name='state'
            value={form.state}
            onChange={handleChange}
            required
            disabled={!!user?.state} // Disable if fetched
          >
            <option value=''>Select state</option>
            {STATE_OPTIONS.map((stateName) => (
              <option key={stateName} value={stateName}>
                {stateName}
              </option>
            ))}
          </select>

          <label className='form-label text-sm fw-semibold mt-16'>Qualification *</label>
          <select
            className='form-select'
            name='qualification'
            value={form.qualification}
            onChange={handleChange}
            required
            disabled={!!user?.qualification} // Disable if fetched
          >
            <option value=''>Select qualification</option>
            {QUALIFICATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <div className='form-check event-register-card__consent mt-16'>
            <input
              className='form-check-input'
              type='checkbox'
              id='event-consent'
              name='consent'
              checked={form.consent}
              onChange={handleChange}
              required
            />
            <label className='form-check-label text-sm text-neutral-700' htmlFor='event-consent'>
              I authorize Gradus Team to reach out to me with updates and notifications via
              Email, SMS, WhatsApp and RCS.
            </label>
          </div>
          {isPast ? (
            <button type='button' className='btn btn-outline-secondary w-100 rounded-pill mt-20' disabled>
              Registration Closed
            </button>
          ) : liveWindow && joinUrl ? (
            <button
              type='button'
              className='btn btn-main w-100 rounded-pill mt-20'
              onClick={handleJoinNow}
              disabled={status.submitting}
            >
              {status.submitting ? "Please wait..." : "Join now"}
            </button>
          ) : (
            <button
              type='submit'
              className='btn btn-main w-100 rounded-pill mt-20'
              disabled={status.submitting}
            >
              {status.submitting ? "Registering..." : "Register for free"}
            </button>
          )}
          {status.success ? (
            <p className='text-success-600 text-sm mt-12 mb-0'>
              You’re in! Our team will reach out with joining details.
            </p>
          ) : null}
          {status.error ? (
            <p className='text-danger text-sm mt-12 mb-0'>{status.error}</p>
          ) : null}
        </fieldset>
      </form>
      <p className='event-register-card__foot text-sm text-neutral-500'>
        200+ students have already registered!
      </p>
      {showSuccessModal ? (
        <div className='event-register-modal' role='dialog' aria-modal='true' aria-labelledby='event-register-success-title'>
          <div className='event-register-modal__content'>
            <div className='event-register-modal__icon' aria-hidden='true'>
              ✓
            </div>
            <h4 className='event-register-modal__title' id='event-register-success-title'>
              Registration confirmed
            </h4>
            <p className='event-register-modal__text'>
              You’re in! Our team will reach out with joining details shortly.
            </p>
            <button type='button' className='btn btn-main rounded-pill w-100 mt-2' onClick={() => setShowSuccessModal(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
};

const getTrimmed = (value) => (typeof value === "string" ? value.trim() : "");

const EventDetailsOne = ({ event, loading, error }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const scrollToRegistration = useCallback(() => {
    const formEl = document.getElementById("event-register-form");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    setActiveTab("overview");
  }, [event?.id]);

  const descriptionText = event ? getTrimmed(event.description) : "";
  const summaryText = event ? getTrimmed(event.summary) : "";
  const subtitleText = event ? getTrimmed(event.subtitle) : "";
  const overviewText = descriptionText || summaryText;
  const heroLead = summaryText || subtitleText;

  const renderTab = () => {
    if (activeTab === "instructor") return <InstructorTab event={event} />;
    if (activeTab === "help") return <HelpTab event={event} />;
    return (
      <>
        <OverviewTab event={event} overviewText={overviewText} />
      </>
    );
  };

  return (
    <section className='event-details py-60 bg-white'>
      <div className='container container--lg'>
        {loading ? (
          <div className='event-details__skeleton animate-pulse'>
            <div className='skeleton-thumb rounded-24 mb-32' />
            <div className='skeleton-line w-75 mb-3' />
            <div className='skeleton-line w-50 mb-2' />
            <div className='skeleton-line w-100 mb-2' />
            <div className='skeleton-line w-60' />
          </div>
        ) : error ? (
          <div className='alert alert-danger rounded-16'>{error}</div>
        ) : !event ? (
          <div className='empty-state text-center py-80'>
            <div className='empty-state__illustration mb-24'>
              <i className='ph ph-calendar-x text-3xl text-main-600' />
            </div>
            <h4 className='mb-8'>Event unavailable</h4>
            <p className='text-neutral-600 mb-0'>
              The link might be broken or the event has been archived.
            </p>
          </div>
        ) : (
          <div className='row gy-5'>
            <div className='col-lg-8'>
              <div className='event-hero-card'>
                <div className='d-flex gap-8 flex-wrap align-items-center mb-12'>
                  {event?.category ? <span className='badge badge--category'>{event.category}</span> : null}
                  {event?.badge ? <span className='badge badge--accent ms-2'>{event.badge}</span> : null}
                  {event?.eventType && event.eventType !== event.badge ? (
                    <span className='event-type-chip'>{event.eventType}</span>
                  ) : null}
                </div>
                <h1 className='display-5 fw-semibold mb-8 mt-16'>{event?.title}</h1>
                {heroLead ? <p className='text-neutral-600 mb-24'>{heroLead}</p> : null}
                <EventTabs active={activeTab} onChange={setActiveTab} />
                <div className='event-tab-content'>{renderTab()}</div>
              </div>
            </div>
            <div className='col-lg-4'>
              <RegistrationCard event={event} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default EventDetailsOne;
