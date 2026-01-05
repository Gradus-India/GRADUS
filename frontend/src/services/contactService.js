import apiClient from "./apiClient";

export const submitContactInquiry = async ({
  name,
  email,
  phone,
  state,
  region,
  institution,
  course,
  message,
  qualification,
  eventDetails,
}) => {
  const payload = {
    name,
    email,
    phone,
    state,
    region,
    institution,
    course,
    message,
    qualification,
  };

  if (eventDetails) {
    payload.eventDetails = eventDetails;
  }

  return apiClient.post("/inquiries", payload);
};

export const submitEventRegistration = async ({
  name,
  email,
  phone,
  state,
  qualification,
  city,
  college,
  course,
  message,
  eventDetails,
  consent,
  token,
}) => {
  const payload = {
    name,
    email,
    phone,
    state,
    qualification,
    city,
    college,
    course,
    message,
    eventDetails,
    consent,
  };

  return apiClient.post("/event-registrations", payload, { token });
};

export default {
  submitContactInquiry,
  submitEventRegistration,
};
