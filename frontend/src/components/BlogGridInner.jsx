import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import apiClient, { API_BASE_URL } from "../services/apiClient";

const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");
const FALLBACK_IMAGE = "/assets/images/thumbs/blog-two-img1.png";
const PAGE_SIZE = 9;

const BlogGridInner = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const page = useMemo(() => {
    const pageParam = Number(searchParams.get("page")) || 1;
    return pageParam < 1 ? 1 : pageParam;
  }, [searchParams]);

  const category = useMemo(() => {
    const raw = searchParams.get("category");
    return raw ? raw.trim() : "";
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;

    const fetchBlogs = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (category) {
          params.append("category", category);
        }
        const sortParam = searchParams.get("sort");
        if (sortParam) {
          params.append("sort", sortParam);
        }

        const { items } = await apiClient.get(`/blogs?${params.toString()}`);
        if (!isMounted) {
          return;
        }
        setBlogs(items || []);
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setError(err?.message || "Failed to load blogs");
        setBlogs([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchBlogs();

    return () => {
      isMounted = false;
    };
  }, [category]);

  const handleSortChange = (event) => {
    const nextSort = event.target.value;
    const params = new URLSearchParams(searchParams);
    params.set("sort", nextSort);
    params.set("page", String(page));
    if (category) {
      params.set("category", category);
    }
    setSearchParams(params);
  };

  const formattedBlogs = useMemo(() => {
    return blogs.map((blog) => {
      const publishedDate = blog.publishedAt || blog.createdAt;
      const date = publishedDate ? new Date(publishedDate) : null;
      const day = date ? String(date.getDate()).padStart(2, "0") : "--";
      const month = date ? date.toLocaleString("en-US", { month: "short" }).toUpperCase() : "";
      const dateString = date
        ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "";
      const featuredImage = blog.featuredImage
        ? blog.featuredImage.startsWith("http")
          ? blog.featuredImage
          : `${ASSET_BASE_URL}${blog.featuredImage}`
        : FALLBACK_IMAGE;
      const excerpt = blog.excerpt || blog.content?.replace(/<[^>]+>/g, "").slice(0, 150) || "";

      return {
        id: blog.id,
        slug: blog.slug,
        title: blog.title,
        author: blog.author || "Admin",
        views: blog.meta?.views ?? 0,
        comments: blog.meta?.comments ?? 0,
        excerpt,
        day,
        month,
        dateString,
        featuredImage,
      };
    });
  }, [blogs]);

  return (
    <div className='blog-page-section pt-60 pb-120'>
      <div className='container'>
        <div className='flex-between gap-16 flex-wrap mb-40'>
          <span className='text-neutral-500'>
            Showing {formattedBlogs.length} Results
            {category ? ` in ${category}` : ""}
          </span>
          <div className='flex-align gap-16'>
            <div className='flex-align gap-8'>
              <span className='text-neutral-500 flex-shrink-0'>Sort By :</span>
              <select
                className='form-select ps-20 pe-28 py-8 fw-medium rounded-pill bg-main-25 border border-neutral-30 text-neutral-700'
                onChange={handleSortChange}
                value={searchParams.get("sort") || "newest"}
              >
                <option value='newest'>Newest</option>
                <option value='popular'>Popular</option>
              </select>
            </div>
            <button
              type='button'
              className='list-bar-btn text-xl w-40 h-40 bg-main-600 text-white rounded-8 flex-center d-lg-none'
            >
              <i className='ph-bold ph-funnel' />
            </button>
          </div>
        </div>

        {loading ? (
          <div className='d-flex justify-content-center py-5'>
            <div className='spinner-border text-primary' role='status'>
              <span className='visually-hidden'>Loading...</span>
            </div>
          </div>
        ) : error ? (
          <div className='alert alert-danger' role='alert'>
            {error}
          </div>
        ) : formattedBlogs.length === 0 ? (
          <div className='alert alert-info' role='alert'>
            No blogs found.
          </div>
        ) : (
          <div className='row gy-4'>
            {formattedBlogs.map((blog) => (
              <div key={blog.id} className='col-lg-4 col-sm-6'>
                <div className='blog-item bg-white rounded-16 p-12 h-100 border border-neutral-30 hover-shadow-lg transition-all-300 hover-translate-y--5'>
                  <div className='course-item__thumb rounded-12 overflow-hidden position-relative'>
                    <Link to={`/blog/${blog.slug}`} className='w-100 h-100 d-block'>
                      <img
                        src={blog.featuredImage}
                        alt={blog.title}
                        className='rounded-12 cover-img transition-all-500 hover-scale-105'
                      />
                    </Link>
                  </div>
                  <div className='p-24 position-relative'>
                    <h4 className='mb-16'>
                      <Link
                        to={`/blog/${blog.slug}`}
                        className='link text-line-2 text-start text-neutral-700 hover-text-main-600 fw-bold'
                      >
                        {blog.title}
                      </Link>
                    </h4>
                    <div className='flex-between gap-8 pt-12 border-top border-neutral-50 mt-12 border-dashed border-0'>
                      <span className='text-neutral-500 text-sm fw-medium'>By {blog.author}</span>
                      <span className='text-neutral-500 text-sm'>{blog.dateString}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogGridInner;
