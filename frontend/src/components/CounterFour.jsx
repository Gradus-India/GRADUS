import React, { useState } from "react";
import ModalVideo from "react-modal-video";
import "react-modal-video/css/modal-video.css";
import { Link } from "react-router-dom";
const CounterFour = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <section className='choose-us py-120 position-relative z-1 mash-bg-main mash-bg-main-two'>
      <div className='shape one animation-rotation our-blogs-trigger'>
        <img
          src='/assets/images/shapes/shape1.png'
          alt=''
          role='button'
          title='Blogs'
          aria-label='Blogs'
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') window.location.href = '/blogs';
          }}
          onClick={() => (window.location.href = '/blogs')}
        />
        <span className='our-blogs-tooltip'>Blogs</span>
      </div>
      <div className='animation-walking top-10-percent left-85-percent position-absolute z-n1 our-courses-trigger'>
        <img
          src='/assets/images/shapes/shape3.png'
          alt=''
          role='button'
          title='Our Courses'
          aria-label='Our Courses'
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') window.location.href = '/our-courses';
          }}
          onClick={() => (window.location.href = '/our-courses')}
        />
        <span className='our-courses-tooltip'>Our Courses</span>
      </div>

      <div className='container'>
        <div className='row gy-4'>
          <div className='col-xl-6'>
            <div className='choose-us__content'>
              <div className='mb-40'>
                <div className='flex-align gap-8 mb-16 wow bounceInDown'>
                  <span className='text-16 text-main-600'>
                    <i className='ph-bold ph-book' />
                  </span>
                  <h5 className='mb-0 text-main-600'>About Us</h5>
                </div>
                <h2 className='mb-24 wow bounceIn'>
                  The Creating lifelong learners, pioneering a better future
                </h2>
                <p className='text-neutral-500 text-line-2  wow bounceInUp'>
                  We are dedicated to shaping the leaders of tomorrow by
                  delivering innovative and impactful learning experiences.
                </p>
              </div>
              <div className='mb-40'>
                <div className='mb-16'>
                  <span className='text-neutral-700 text-20 fw-medium'>
                    Course Loading
                  </span>
                </div>
                <div
                  className='progress-wrapper d-flex align-items-center flex-column gap-4'
                  data-perc='85%'
                >
                  <div className='h-50-px position-relative w-100 d-flex'>
                    <span className='floating-label position-absolute text-xl text-main-600 fw-normal radius-8 w-50-px h-32-px z-1 d-flex justify-content-center align-items-center'>
                      85%
                    </span>
                    <div
                      className='progress mt-auto h-8-px w-100 bg-primary-50 rounded-pill'
                      role='progressbar'
                      aria-label='Basic example'
                      aria-valuenow={85}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className='progress-bar animated-bar rounded-pill bg-primary-gradien overflow-visible'
                        style={{ width: "85%" }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className='d-flex gap-24 flex-wrap'>
                <div className='max-w-306'>
                  <div className='d-flex gap-12' data-aos='fade-right'>
                    <span>
                      <img
                        src='/assets/images/icons/about-us-five-checkbox.png'
                        alt=''
                      />
                    </span>
                    <h5>Our Mission</h5>
                  </div>
                  <p className='text-14 fw-normal wow bounceIn'>
                    There are many variations of passages of Lorem Ipsum
                    available.
                  </p>
                </div>
                <div className='max-w-306'>
                  <div className='d-flex gap-12' data-aos='fade-left'>
                    <span>
                      <img
                        src='/assets/images/icons/about-us-five-checkbox.png'
                        alt=''
                      />
                    </span>
                    <h5>Our Mission</h5>
                  </div>
                  <p className='text-14 fw-normal wow bounceIn'>
                    There are many variations of passages of Lorem Ipsum
                    available.
                  </p>
                </div>
              </div>
              <div className='d-flex gap-24 flex-wrap mt-40'>
                <div>
                  <Link
                    to='/about-us'
                    className='btn btn-main rounded-pill flex-align d-inline-flex gap-8'
                    data-aos='fade-right'
                  >
                    Read More
                    <i className='ph-bold ph-arrow-up-right d-flex text-lg' />
                  </Link>
                </div>
                <div>
                  <div
                    className='d-flex align-content-center gap-16'
                    data-aos='fade-left'
                  >
                    <span className='bg-warning-800 w-54 h-54 rounded-circle justify-content-center text-center align-items-center d-flex text-white'>
                      <img
                        src='/assets/images/icons/about-us-five-headset.png'
                        alt=''
                      />
                    </span>
                    <div>
                      <span className='text-16 d-inline-flex mb-4'>
                        Support us
                      </span>
                      <h6 className='text-neutral-700'>(704) 555-0127</h6>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className='col-xl-6'>
            <div className='choose-us__thumbs position-relative'>
              <div className='offer-message style-two animation-upDown'>
                <span className=''>
                  <img
                    src='/assets/images/thumbs/about-us-five-img3.png'
                    alt=''
                  />
                </span>
              </div>
              <div className='banner-box one style-two ' data-aos='fade-left'>
                <div className='d-sm-block d-none'>
                  <img
                    src='/assets/images/thumbs/about-us-five-img2.png'
                    alt=''
                    className=''
                  />
                </div>
              </div>
              <div className='text-end' data-aos='zoom-out'>
                <div className='position-relative'>
                  <img
                    src='/assets/images/thumbs/about-us-five-img1.png'
                    alt=''
                    className='choose-us__img rounded-12 w-100'
                    data-tilt=''
                    data-tilt-max={16}
                    data-tilt-speed={500}
                    data-tilt-perspective={5000}
                    data-tilt-full-page-listening=''
                  />
                  <span className='shadow-main-two w-80 h-80 flex-center bg-success-600 rounded-circle position-absolute inset-block-start-0 inset-inline-start-0 mt-40 ms--40 animation-upDown'>
                    <img src='/assets/images/icons/book.png' alt='' />
                  </span>
                </div>
              </div>
              <div className='animation-video' data-aos='zoom-in'>
                <img
                  src='/assets/images/thumbs/about-us-five-img4.png'
                  alt=''
                  className='border border-white rounded-circle border-3'
                  data-tilt=''
                />
                <span
                  onClick={() => setIsOpen(true)}
                  className='play-button w-48 h-48 flex-center bg-warning-800 text-white rounded-circle text-xl position-absolute top-50 start-50 translate-middle'
                >
                  <i className='ph-fill ph-play' />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
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

export default CounterFour;
