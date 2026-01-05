import apiClient from "./apiClient";

const buildQueryString = (params = {}) => {
  const searchParams = new URLSearchParams();

  if (params.search && params.search.trim()) {
    searchParams.set("search", params.search.trim());
  }

  if (params.region && params.region.trim()) {
    searchParams.set("region", params.region.trim());
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

export const fetchContactInquiries = ({ token, search, region } = {}) =>
  apiClient(`/admin/inquiries${buildQueryString({ search, region })}`, {
    token,
  });

export const getContactInquiry = ({ token, inquiryId } = {}) =>
  apiClient(`/admin/inquiries/${inquiryId}`, {
    token,
  });

export const createContactInquiryAdmin = ({ token, data } = {}) =>
  apiClient(`/admin/inquiries`, {
    method: "POST",
    token,
    data,
  });

export const updateContactInquiry = ({ token, inquiryId, data } = {}) =>
  apiClient(`/admin/inquiries/${inquiryId}`, {
    method: "PATCH",
    token,
    data,
  });

export const deleteContactInquiry = ({ token, inquiryId } = {}) =>
  apiClient(`/admin/inquiries/${inquiryId}`, {
    method: "DELETE",
    token,
  });

export const fetchEventRegistrations = ({ token, search } = {}) =>
  apiClient(`/event-registrations${buildQueryString({ search })}`, {
    token,
  });

export const getEventRegistration = ({ token, registrationId } = {}) =>
  apiClient(`/event-registrations/${registrationId}`, {
    token,
  });

export const createEventRegistrationAdmin = ({ token, data } = {}) =>
  apiClient(`/event-registrations`, {
    method: "POST",
    token,
    data,
  });

export const updateEventRegistration = ({ token, registrationId, data } = {}) =>
  apiClient(`/event-registrations/${registrationId}`, {
    method: "PATCH",
    token,
    data,
  });

export const deleteEventRegistration = ({ token, registrationId } = {}) =>
  apiClient(`/event-registrations/${registrationId}`, {
    method: "DELETE",
    token,
  });

export const sendEventRegistrationJoinLinks = ({
  token,
  registrationIds,
  joinUrl,
  subject,
  additionalNote,
} = {}) =>
  apiClient(`/event-registrations/send-join-link`, {
    method: "POST",
    token,
    data: { registrationIds, joinUrl, subject, additionalNote },
  });

export const resendEventRegistrationConfirmation = ({
  token,
  registrationId,
} = {}) =>
  apiClient(`/event-registrations/${registrationId}/resend-confirmation`, {
    method: "POST",
    token,
  });

export const resendEventRegistrationConfirmationsBulk = ({
  token,
  registrationIds,
} = {}) =>
  apiClient(`/event-registrations/resend-confirmations`, {
    method: "POST",
    token,
    data: { registrationIds },
  });

export const syncEventRegistrationsToSheet = ({
  token,
  registrationIds,
} = {}) =>
  apiClient(`/event-registrations/sync-sheet`, {
    method: "POST",
    token,
    data: { registrationIds },
  });

export const syncLandingPageRegistrationsToSheet = ({
  token,
  registrationIds,
} = {}) =>
  apiClient(`/admin/landing-pages/registrations/sync-sheet`, {
    method: "POST",
    token,
    data: { registrationIds },
  });

export const sendLandingPageRegistrationReminders = ({
  token,
  registrationIds,
} = {}) =>
  apiClient(`/admin/landing-pages/registrations/send-reminder`, {
    method: "POST",
    token,
    data: { registrationIds },
  });

export const updateLandingPageRegistration = ({
  token,
  registrationId,
  data,
} = {}) =>
  apiClient(`/admin/landing-pages/registrations/${registrationId}`, {
    method: "PATCH",
    token,
    data,
  });

export const deleteLandingPageRegistration = ({
  token,
  registrationId,
} = {}) =>
  apiClient(`/admin/landing-pages/registrations/${registrationId}`, {
    method: "DELETE",
    token,
  });

export const resendLandingPageJoinLinks = ({
  token,
  registrationIds,
} = {}) =>
  apiClient(`/admin/landing-pages/registrations/resend-links`, {
    method: "POST",
    token,
    data: { registrationIds },
  });