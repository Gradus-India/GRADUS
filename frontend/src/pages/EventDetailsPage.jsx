import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CertificateOne from "../components/CertificateOne";
import EventDetailsOne from "../components/EventDetailsOne";
import FooterOne from "../components/FooterOne";
import HeaderOne from "../components/HeaderOne";
import Animation from "../helper/Animation";
import Preloader from "../helper/Preloader";
import { fetchEventBySlug } from "../services/eventService";
import MasterclassTemplate from "./MasterclassTemplate";

const EventDetailsPage = () => {
  const { slug } = useParams();
  const [state, setState] = useState({
    loading: true,
    event: null,
    error: null,
  });

  useEffect(() => {
    if (!slug) {
      setState({
        loading: false,
        event: null,
        error: "Please select an event from the listing page.",
      });
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const loadEvent = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await fetchEventBySlug(slug, { signal: controller.signal });
        if (!isMounted) return;
        setState({ loading: false, event: data, error: null });
      } catch (err) {
        if (!isMounted || err?.name === "AbortError") return;
        setState({
          loading: false,
          event: null,
          error: err?.message || "Failed to load event details",
        });
      }
    };

    loadEvent();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [slug]);

  return (
    <>
      <Preloader />
      <Animation />
      <Animation />
      {/* If it is a Masterclass, we skip standard Header/Footer here because the Template has them */}
      <>
        <HeaderOne />
        <EventDetailsOne event={state.event} loading={state.loading} error={state.error} />
        <CertificateOne />
        <FooterOne />
      </>
    </>
  );
};

export default EventDetailsPage;
