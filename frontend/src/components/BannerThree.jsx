import { useEffect, useRef, useState } from "react";
import Slider from "react-slick";
import ModalVideo from "react-modal-video";
import "react-modal-video/css/modal-video.css";
import { Link } from "react-router-dom";
import AOS from "aos";
const BannerThree = () => {
  const sliderRef = useRef();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    AOS.init({
      duration: 1000,
      once: true,
      easing: "ease-in-out",
      offset: 0,
    });
  }, []);

  const handleBeforeChange = () => {
    if (typeof document !== "undefined") {
      const wowElements = document.querySelectorAll(".wow");
      wowElements.forEach((el) => {
        el.style.visibility = "hidden";
        el.classList.remove("animated");
      });
    }
  };

  const handleAfterChange = () => {
    if (typeof window !== "undefined") {
      AOS.refreshHard(); // Use refreshHard to reset and restart AOS
      const wowElements = document.querySelectorAll(".wow");
      wowElements.forEach((el) => {
        el.style.visibility = "visible";
      });
    }
  };

  const settings = {
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: false,
    autoplaySpeed: 2000,
    speed: 900,
    dots: false,
    pauseOnHover: true,
    arrows: false,
    draggable: true,
    infinite: true,
    fade: true,

    beforeChange: handleBeforeChange,
    afterChange: handleAfterChange,
  };
  return (
    <section className='banner-three position-relative responsive-arrow overflow-hidden'>
      <button
        type='button'
        id='banner-three-prev'
        onClick={() => sliderRef.current.slickPrev()}
        className='slick-arrow-prev slick-arrow flex-center rounded-circle bg-white text-main-600 hover-border-main-600 text-2xl hover-bg-main-600 hover-text-white transition-1 w-56 h-56 position-absolute ms-16 inset-inline-start-0 top-50 translate-middle-y z-3'
      >
        <i className='ph-bold ph-arrow-left' />
      </button>
      <button
        type='button'
        id='banner-three-next'
        onClick={() => sliderRef.current.slickNext()}
        className='slick-arrow-next slick-arrow flex-center rounded-circle bg-white text-main-600 hover-border-main-600 text-2xl hover-bg-main-600 hover-text-white transition-1 w-56 h-56 position-absolute me-16 inset-inline-end-0 top-50 translate-middle-y z-3'
      >
        <i className='ph-bold ph-arrow-right' />
      </button>
      <Slider ref={sliderRef} {...settings} className='banner-three__slider '>
        <div>
          <div
            className='banner-three__item background-img bg-img linear-overlay position-relative'
            style={{
              backgroundImage: `url(${"/assets/images/thumbs/banner-three-img1.png"})`,
            }}
          >
            <div className='container'>
              <div className='row'>
                <div className='col-xxl-6 col-xl-8 col-lg-10 z-1'>
                  <div className='banner-content pe-md-4'>
                    <div className='flex-align gap-8 mb-16 wow bounceInDown'>
                      <span className='text-yellow-600 text-2xl d-flex'>
                        <i className='ph-bold ph-book-open' />
                      </span>
                      <h5 className='text-yellow-600 mb-0 fw-medium'>
                        Career Acceleration by MDM MADHUBANI TECHNOLOGIES PRIVATE LIMITED
                      </h5>
                    </div>
                    <h1 className='display2 mb-24 text-white fw-medium wow bounceInLeft'>
                      Launch Your Career with {" "}
                      <span
                        className='text-yellow-600  wow bounceInRight'
                        data-wow-duration='2s'
                        data-wow-delay='.5s'
                      >
                        Gradus
                      </span>
                      {" "}
                      Pathways
                    </h1>
                    <p className='text-white text-line-2 wow bounceInDown'>
                      Join a placement-assured journey that fuses classroom learning with real market exposure, paid internships, and recruiter-ready training modules.
                    </p>
                  </div>
                  <div className='buttons-wrapper flex-align flex-wrap gap-24 mt-40'>
                    <Link
                      to='#'
                      className='btn btn-main rounded-pill flex-align gap-8  wow bounceInLeft'
                      data-wow-duration='1s'
                      data-wow-delay='.5s'
                    >
                      Apply for Cohort
                      <i className='ph-bold ph-arrow-up-right d-flex text-lg' />
                    </Link>
                    <div
                      className='flex-align gap-16  wow bounceInRight'
                      data-wow-duration='1s'
                      data-wow-delay='.5s'
                    >
                      {/* <span
                        onClick={() => setIsOpen(true)}
                        className='play-button position-relative z-1 w-48 h-48 flex-center bg-main-two-600 text-white rounded-circle text-xl'
                      >
                        <i className='ph-fill ph-play' />
                      </span> */}

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div
            className='banner-three__item background-img bg-img linear-overlay position-relative'
            style={{
              backgroundImage: `url(${"/assets/images/thumbs/banner-three-img2.png"})`,
            }}
          >
            <div className='container'>
              <div className='row'>
                <div className='col-xxl-6 col-xl-8 col-lg-10 z-1'>
                  <div className='banner-content pe-md-4'>
                    <div className='flex-align gap-8 mb-16 wow bounceInDown'>
                      <span className='text-yellow-600 text-2xl d-flex'>
                        <i className='ph-bold ph-book-open' />
                      </span>
                      <h5 className='text-yellow-600 mb-0 fw-medium'>
                        Mentors Who Have Built Markets
                      </h5>
                    </div>
                    <h1 className='display2 mb-24 text-white fw-medium wow bounceInLeft'>
                      Mentor-Led Learning,
                      <span
                        className='text-yellow-600  wow bounceInRight'
                        data-wow-duration='2s'
                        data-wow-delay='.5s'
                      >
                        Real Outcomes
                      </span>
                    </h1>
                    <p className='text-white text-line-2 wow bounceInDown'>
                      Learn from SEBI-certified experts through case clinics, market simulations, and coaching that ignites interview-ready confidence.
                    </p>
                  </div>
                  <div className='buttons-wrapper flex-align flex-wrap gap-24 mt-40'>
                    <Link
                      to='#'
                      className='btn btn-main rounded-pill flex-align gap-8  wow bounceInLeft'
                      data-wow-duration='1s'
                      data-wow-delay='.5s'
                    >
                      Meet Our Mentors
                      <i className='ph-bold ph-arrow-up-right d-flex text-lg' />
                    </Link>
                    <div
                      className='flex-align gap-16  wow bounceInRight'
                      data-wow-duration='1s'
                      data-wow-delay='.5s'
                    >
                      {/* <span
                        onClick={() => setIsOpen(true)}
                        className='play-button position-relative z-1 w-48 h-48 flex-center bg-main-two-600 text-white rounded-circle text-xl'
                      >
                        <i className='ph-fill ph-play' />
                      </span> */}

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div
            className='banner-three__item background-img bg-img linear-overlay position-relative'
            style={{
              backgroundImage: `url(${"/assets/images/thumbs/banner-three-img3.png"})`,
            }}
          >
            <div className='container'>
              <div className='row'>
                <div className='col-xxl-6 col-xl-8 col-lg-10 z-1'>
                  <div className='banner-content pe-md-4'>
                    <div className='flex-align gap-8 mb-16 wow bounceInDown'>
                      <span className='text-yellow-600 text-2xl d-flex'>
                        <i className='ph-bold ph-book-open' />
                      </span>
                      <h5 className='text-yellow-600 mb-0 fw-medium'>
                        178 Strategic Hiring Alliances
                      </h5>
                    </div>
                    <h1 className='display2 mb-24 text-white fw-medium wow bounceInLeft'>
                      Paid Internships,
                      <span
                        className='text-yellow-600  wow bounceInRight'
                        data-wow-duration='2s'
                        data-wow-delay='.5s'
                      >
                        Placement Assurance
                      </span>
                    </h1>
                    <p className='text-white text-line-2 wow bounceInDown'>
                      Accelerate into high-impact roles with nationwide recruiter drives, on-ground immersion, and lifelong alumni support from MDM MADHUBANI TECHNOLOGIES PRIVATE LIMITED.
                    </p>
                  </div>
                  <div className='buttons-wrapper flex-align flex-wrap gap-24 mt-40'>
                    <Link
                      to='#'
                      className='btn btn-main rounded-pill flex-align gap-8  wow bounceInLeft'
                      data-wow-duration='1s'
                      data-wow-delay='.5s'
                    >
                      Discover Our Network
                      <i className='ph-bold ph-arrow-up-right d-flex text-lg' />
                    </Link>
                    <div
                      className='flex-align gap-16  wow bounceInRight'
                      data-wow-duration='1s'
                      data-wow-delay='.5s'
                    >
                      {/* <span
                        onClick={() => setIsOpen(true)}
                        className='play-button position-relative z-1 w-48 h-48 flex-center bg-main-two-600 text-white rounded-circle text-xl'
                      >
                        <i className='ph-fill ph-play' />
                      </span> */}

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Slider>
      <ModalVideo
        channel='youtube'
        autoplay
        isOpen={isOpen}
        videoId='XxVg_s8xAms'
        onClose={() => setIsOpen(false)}
        allowFullScreen
      />
    </section>
  );
};

export default BannerThree;
