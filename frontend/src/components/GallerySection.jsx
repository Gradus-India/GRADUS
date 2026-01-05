import { useState, useEffect } from "react";
import LightGallery from "lightgallery/react";
import lgThumbnail from "lightgallery/plugins/thumbnail";
import lgZoom from "lightgallery/plugins/zoom";

import "lightgallery/css/lightgallery.css";
import "lightgallery/css/lg-zoom.css";
import "lightgallery/css/lg-thumbnail.css";

import apiClient from "../services/apiClient";

// Tab categories matching Admin Panel options
const TABS = [
  { id: 'University', label: 'University', icon: 'ph-magic-wand' },
  { id: 'Tutors', label: 'Tutors', icon: 'ph-code' },
  { id: 'Events', label: 'Events', icon: 'ph-calendar' }, // Replaced Education with Events to match Admin
  { id: 'Other', label: 'Other', icon: 'ph-squares-four' }
];

const GallerySection = () => {
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const data = await apiClient.get('/gallery');
        setItems(data.items || []);
      } catch (error) {
        console.error("Failed to fetch gallery items", error);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

  const filteredItems = items.filter(item => item.category === activeTab);

  return (
    <section className='gallery py-120'>
      <div className='container'>
        <div className='container'>
          <div className='section-heading text-center'>
            <div className='flex-align d-inline-flex gap-8 mb-16'>
              <span className='text-main-600 text-2xl d-flex'>
                <i className='ph-bold ph-book-open' />
              </span>
              <h5 className='text-main-600 mb-0'>Gallery</h5>
            </div>
            <h2 className='mb-24'>Explore Our Gallery</h2>
            <p className=''>
              Students can register for the workshops through the Gradus
              platform. Limited seats are available
            </p>
          </div>
          <div className='text-center'>
            <div
              className='nav-tab-wrapper bg-white border border-neutral-40 p-16 mb-40 d-inline-block'
              data-aos='zoom-out'
            >
              <ul
                className='nav nav-pills common-tab edit gap-16'
                id='pills-tab'
                role='tablist'
              >
                {TABS.map(tab => (
                  <li className='nav-item' role='presentation' key={tab.id}>
                    <button
                      className={`nav-link rounded-pill bg-main-25 text-md fw-medium text-neutral-500 flex-center w-100 gap-8 ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                      type='button'
                      role='tab'
                    >
                      <i className={`text-xl d-flex text-main-600 ph-bold ${tab.icon}`} />
                      {tab.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className='tab-content'>
            <div className='tab-pane fade show active' role='tabpanel'>
              {/* Masonry Start */}
              <div className='masonry'>
                {loading ? (
                  <div className="text-center py-4">Loading...</div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-4 text-neutral-500">No images found for this category.</div>
                ) : (
                  // Key forces re-render of LightGallery when items change, critical for it to pick up new DOM
                  <LightGallery
                    key={`${activeTab}-${filteredItems.length}`}
                    speed={500}
                    plugins={[lgThumbnail, lgZoom]}
                  >
                    {filteredItems.map(item => (
                      <a
                        key={item._id}
                        className='masonry__item position-relative rounded-12 overflow-hidden'
                        href={item.imageUrl}
                      >
                        <img
                          alt={item.title}
                          src={item.imageUrl}
                          className="w-100 object-fit-cover"
                        />
                      </a>
                    ))}
                  </LightGallery>
                )}
              </div>
              {/* Masonry End */}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GallerySection;
