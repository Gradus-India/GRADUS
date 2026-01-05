import { useState } from "react";
import ModalVideo from "react-modal-video";
import "react-modal-video/css/modal-video.css";
import { Link } from "react-router-dom";
import MiniPartnerLogos from "./MiniPartnerLogos";

const ChooseUsOne = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <section className='choose-us pt-120 position-relative z-1 mash-bg-main mash-bg-main-two'>
        <img
          src='/assets/images/shapes/shape2.png'
          alt=''
          className='shape one animation-scalation'
        />
        <img
          src='/assets/images/shapes/shape2.png'
          alt=''
          className='shape six animation-scalation'
        />
        <div className='container'>
          <div className='row gy-4'>
            <div className='col-xl-6'>
              <div className='choose-us__content'>
                <div className='mb-40'>
                  <div className='flex-align gap-8 mb-16 wow bounceInDown'>
                    <span className='w-8 h-8 bg-main-600 rounded-circle' />
                    <h5 className='text-main-600 mb-0'>Why Choose Gradus</h5>
                  </div>
                  <h2 className='mb-24  wow bounceIn'>
                    The Gradus Advantage: Bridging Education and Industry
                  </h2>
                  <div className='text-neutral-500 wow bounceInUp'>
                    <p className='mb-16'>
                      Gradus, an ambitious initiative of MDM MADHUBANI TECHNOLOGIES PRIVATE LIMITED, is conceived as a premier career accelerator that forges a decisive link between academic instruction and professional ascendancy. Every pathway is meticulously curated for management aspirants, engineering graduates, and finance enthusiasts, transforming theoretical acumen into demonstrable competence.
                    </p>
                    <p className='mb-0'>
                      Our learning ecosystem is anchored in live projects, experiential immersion, and incisive mentorship from erudite industry experts so that ambition is refined into expertise and potential is elevated into accomplishment.
                    </p>
                  </div>
                </div>
                <ul>
                  <li
                    className='flex-align gap-12 mb-16'
                    data-aos='fade-up-left'
                    data-aos-duration={200}
                  >
                    <span className='flex-shrink-0 text-xl text-main-600 d-flex'>
                      <i className='ph-bold ph-checks' />
                    </span>
                    <span className='flex-grow-1 text-neutral-500'>
                      Immersive two-month paid internships paired with assured placement trajectories at prestigious organisations.
                    </span>
                  </li>
                  <li
                    className='flex-align gap-12 mb-16'
                    data-aos='fade-up-left'
                    data-aos-duration={400}
                  >
                    <span className='flex-shrink-0 text-xl text-main-600 d-flex'>
                      <i className='ph-bold ph-checks' />
                    </span>
                    <span className='flex-grow-1 text-neutral-500'>
                      Curriculum calibrated with the competencies sought by 178 strategic industry partners to deliver truly industry-ready talent.
                    </span>
                  </li>
                  <li
                    className='flex-align gap-12 mb-16'
                    data-aos='fade-up-left'
                    data-aos-duration={500}
                  >
                    <span className='flex-shrink-0 text-xl text-main-600 d-flex'>
                      <i className='ph-bold ph-checks' />
                    </span>
                    <span className='flex-grow-1 text-neutral-500'>
                      Distinguished mentors from finance, management, engineering, and markets cultivate critical thinking and professional resilience.
                    </span>
                  </li>
                </ul>
                <div className='pt-24 border-top border-neutral-50 mt-28 border-dashed border-0'>
                  <Link
                    to='/about-us'
                    className='btn btn-main rounded-pill flex-align d-inline-flex gap-8'
                  >
                    Read More
                    <i className='ph-bold ph-arrow-up-right d-flex text-lg' />
                  </Link>
                </div>
              </div>
            </div>
            <div className='col-xl-6'>
              <div className='choose-us__thumbs position-relative'>
                <div className='offer-message style-two px-24 py-12 rounded-12 bg-white fw-medium flex-align d-inline-flex gap-16 box-shadow-lg animation-upDown'>
                  <span className='flex-shrink-0 w-48 h-48 bg-dark-yellow text-white text-2xl flex-center rounded-circle'>
                    <img src='/assets/images/icons/stars.png' alt='' />
                  </span>
                  <div>
                    <span className='text-lg text-neutral-700 d-block'>
                      Paid Internships
                    </span>
                    <span className='text-neutral-500'>Placement assurance pathway</span>
                  </div>
                </div>
                <div
                  className='banner-box one style-two px-24 py-12 rounded-12 bg-white fw-medium box-shadow-lg d-inline-block'
                  data-aos='fade-left'
                >
                  <span className='text-main-600'>178+</span> Strategic Industry Partners
                  <MiniPartnerLogos count={6} />
                </div>
                <div className='text-end' data-aos='zoom-out'>
                  <div className='d-sm-inline-block d-block position-relative'>
                    <img
                      src='/assets/images/thumbs/choose-us-img1.png'
                      alt=''
                      className='choose-us__img rounded-12'
                      data-tilt=''
                      data-tilt-max={16}
                      data-tilt-speed={500}
                      data-tilt-perspective={5000}
                      data-tilt-full-page-listening=''
                    />
                    <span className='shadow-main-two w-80 h-80 flex-center bg-main-two-600 rounded-circle position-absolute inset-block-start-0 inset-inline-start-0 mt-40 ms--40 animation-upDown'>
                      <img src='/assets/images/icons/book.png' alt='' />
                    </span>
                  </div>
                </div>
                <div className='animation-video' data-aos='zoom-in'>
                  <img
                    src='/assets/images/thumbs/choose-us-img2.png'
                    alt=''
                    className='border border-white rounded-circle border-3'
                    data-tilt=''
                  />
                  <span
                    onClick={() => setIsOpen(true)}
                    className='play-button w-48 h-48 flex-center bg-main-600 text-white rounded-circle text-xl position-absolute top-50 start-50 translate-middle'
                  >
                    <i className='ph ph-play'></i>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <ModalVideo
        channel='youtube'
        autoplay
        isOpen={isOpen}
        videoId='XxVg_s8xAms'
        onClose={() => setIsOpen(false)}
        allowFullScreen
      />
    </>
  );
};

export default ChooseUsOne;
