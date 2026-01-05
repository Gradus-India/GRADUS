/*
  Application routes (public site)
  - Centralized react-router configuration and cross-cutting providers
  - Adds Meta manager, analytics tracker, and chatbot widget globally
*/
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Routes, Route, useParams } from "react-router-dom";
import RouteScrollToTop from "./helper/RouteScrollToTop.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import MetaManager from "./components/MetaManager.jsx";
import SiteAnalyticsTracker from "./components/SiteAnalyticsTracker.jsx";
import HelpLauncher from "./components/HelpLauncher.jsx";
import GoogleOneTap from "./components/GoogleOneTap.jsx";

import HomePageOne from "./pages/HomePageOne";
import AboutPage from "./pages/AboutPage.jsx";
const ApplyAdmissionPage = lazy(() => import("./pages/ApplyAdmissionPage.jsx"));
import BlogPage from "./pages/BlogPage.jsx";
const BlogDetailsPage = lazy(() => import("./pages/BlogDetailsPage.jsx"));
const BookOnlineClassPage = lazy(() => import("./pages/BookOnlineClassPage.jsx"));
const CartPage = lazy(() => import("./pages/CartPage.jsx"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage.jsx"));
import ContactPage from "./pages/ContactPage.jsx";
const CoursePage = lazy(() => import("./pages/CoursePage.jsx"));
const CourseDetailsPage = lazy(() => import("./pages/CourseDetailsPage.jsx"));
const EventDetailsPage = lazy(() => import("./pages/EventDetailsPage.jsx"));
import EventsPage from "./pages/EventsPage.jsx";
const MyCoursesPage = lazy(() => import("./pages/MyCoursesPage.jsx"));
const FindTutorsPage = lazy(() => import("./pages/FindTutorsPage.jsx"));
const GalleryPage = lazy(() => import("./pages/GalleryPage.jsx"));
const CandidatesAndInternsPage = lazy(() => import("./pages/CandidatesAndInternsPage.jsx"));
const EmployeeAndAlumniPage = lazy(() => import("./pages/EmployeeAndAlumniPage.jsx"));
const InstructorPage = lazy(() => import("./pages/InstructorPage.jsx"));
const InstructorDetailsPage = lazy(() => import("./pages/InstructorDetailsPage.jsx"));
const InstructorTwoPage = lazy(() => import("./pages/InstructorTwoPage.jsx"));
const LessonDetailsPage = lazy(() => import("./pages/LessonDetailsPage.jsx"));
const PricingPlanPage = lazy(() => import("./pages/PricingPlanPage.jsx"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage.jsx"));
const InvestorsPrivacyPage = lazy(() => import("./pages/InvestorsPrivacyPage.jsx"));
const ProductPage = lazy(() => import("./pages/ProductPage.jsx"));
const ProductDetailsPage = lazy(() => import("./pages/ProductDetailsPage.jsx"));
const SignInPage = lazy(() => import("./pages/SignInPage.jsx"));
const ProfilePage = lazy(() => import("./pages/ProfilePage.jsx"));
const ProfileCompletionPage = lazy(() => import("./pages/ProfileCompletionPage.jsx"));
const TuitionJobsPage = lazy(() => import("./pages/TuitionJobsPage.jsx"));
const TutorPage = lazy(() => import("./pages/TutorPage.jsx"));
const TutorDetailsPage = lazy(() => import("./pages/TutorDetailsPage.jsx"));
const ShareholdersPrivacyPage = lazy(() => import("./pages/ShareholdersPrivacyPage.jsx"));
const VisitorPolicyPage = lazy(() => import("./pages/VisitorPolicyPage.jsx"));
const VendorsPrivacyPage = lazy(() => import("./pages/VendorsPrivacyPage.jsx"));
const CancellationRefundsPage = lazy(() => import("./pages/CancellationRefundsPage.jsx"));
const TermsConditionsPage = lazy(() => import("./pages/TermsConditionsPage.jsx"));
const CoursePaymentPage = lazy(() => import("./pages/CoursePaymentPage.jsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.jsx"));
const SupportTicketDetailsPage = lazy(() => import("./pages/SupportTicketDetailsPage.jsx"));
const SocialPortfolioPage = lazy(() => import("./pages/SocialPortfolioPage.jsx"));
const ProgrammeCoursePage = lazy(() => import("./pages/ProgrammeCoursePage.jsx"));
const CourseHomePage = lazy(() => import("./pages/CourseHomePage.jsx"));
const GoogleAuthCallback = lazy(() => import("./pages/GoogleAuthCallback.jsx"));
import OurCoursesPage from "./pages/OurCoursesPage.jsx";
const JoinLiveClass = lazy(() => import("./pages/JoinLiveClass.jsx"));
const VaibhavBatraMasterclass = lazy(() => import("./pages/VaibhavBatraMasterclass.jsx"));


const JobsPage = lazy(() => import("./pages/JobsPage.jsx"));
const DynamicLandingPage = lazy(() => import("./pages/DynamicLandingPage.jsx"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.jsx"));


const GradusXRedirect = () => {
  const { course } = useParams();
  return <Navigate to={`/gradus-x/${course}`} replace />;
};

const BlogSlugRedirect = () => {
  const { slug } = useParams();
  return <Navigate to={`/blog/${slug}`} replace />;
};

function App() {
  return (
    <BrowserRouter>
      <MetaManager />
      <RouteScrollToTop />
      <SiteAnalyticsTracker />
      <HelpLauncher />
      <GoogleOneTap />

      <Suspense fallback={<div className='page-loading'>Loading...</div>}>
        <Routes>
          <Route exact path='/' element={<HomePageOne />} />
          <Route exact path='/masterclass-on-currency-market-with-vaibhav-batra' element={<VaibhavBatraMasterclass />} />
          <Route exact path='/about-us' element={<AboutPage />} />
          <Route exact path='/apply-admission' element={<ApplyAdmissionPage />} />
          <Route exact path='/blogs' element={<BlogPage />} />
          <Route exact path='/blog/:slug' element={<BlogDetailsPage />} />
          <Route exact path='/blogs/:slug' element={<BlogSlugRedirect />} />
          <Route
            exact
            path='/book-online-class'
            element={<BookOnlineClassPage />}
          />
          <Route exact path='/cart' element={<CartPage />} />
          <Route exact path='/checkout' element={<CheckoutPage />} />
          <Route exact path='/contact' element={<ContactPage />} />
          <Route exact path='/course-grid-view' element={<Navigate to='/our-courses' replace />} />
          <Route exact path='/our-courses' element={<OurCoursesPage />} />
          { /* Programmes page removed */}
          <Route exact path='/course-list-view' element={<Navigate to='/our-courses' replace />} />
          <Route exact path='/course-details' element={<CourseDetailsPage />} />

          <Route exact path='/events' element={<EventsPage />} />
          <Route exact path='/events/:slug' element={<EventDetailsPage />} />
          <Route exact path='/event-details/:slug?' element={<EventDetailsPage />} />
          { /* FAQ page removed */}
          <Route
            exact
            path='/my-courses'
            element={
              <RequireAuth>
                <MyCoursesPage />
              </RequireAuth>
            }
          />
          <Route
            exact
            path='/support'
            element={
              <RequireAuth>
                <SupportPage />
              </RequireAuth>
            }
          />
          <Route
            exact
            path='/support/:id'
            element={
              <RequireAuth>
                <SupportTicketDetailsPage />
              </RequireAuth>
            }
          />
          <Route exact path='/favorite-course' element={<Navigate to='/my-courses' replace />} />
          <Route exact path='/find-tutors' element={<FindTutorsPage />} />
          <Route exact path='/gallery' element={<GalleryPage />} />
          <Route exact path='/instructor' element={<Navigate to='/our-courses' replace />} />
          <Route exact path='/instructor-details' element={<Navigate to='/our-courses' replace />} />
          <Route exact path='/instructor-two' element={<Navigate to='/our-courses' replace />} />
          <Route exact path='/lesson-details' element={<LessonDetailsPage />} />
          <Route exact path='/pricing-plan' element={<PricingPlanPage />} />
          <Route exact path='/privacy-policy' element={<PrivacyPolicyPage />} />
          <Route
            exact
            path='/candidates-interns'
            element={<CandidatesAndInternsPage />}
          />
          <Route
            exact
            path='/employee-alumni'
            element={<EmployeeAndAlumniPage />}
          />
          <Route
            exact
            path='/investors'
            element={<InvestorsPrivacyPage />}
          />
          <Route
            exact
            path='/shareholders'
            element={<ShareholdersPrivacyPage />}
          />
          <Route
            exact
            path='/visitor-policy'
            element={<VisitorPolicyPage />}
          />
          <Route
            exact
            path='/vendors'
            element={<VendorsPrivacyPage />}
          />
          <Route
            exact
            path='/cancellation-refunds'
            element={<CancellationRefundsPage />}
          />
          <Route
            exact
            path='/terms-and-conditions'
            element={<TermsConditionsPage />}
          />
          <Route exact path='/product' element={<ProductPage />} />
          <Route exact path='/product-details' element={<ProductDetailsPage />} />
          <Route exact path='/sign-in' element={<SignInPage />} />
          <Route exact path='/auth/callback' element={<GoogleAuthCallback />} />
          <Route exact path='/auth/google/callback' element={<GoogleAuthCallback />} />
          <Route
            exact
            path='/profile'
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            exact
            path='/profile-completion'
            element={
              <RequireAuth>
                <ProfileCompletionPage />
              </RequireAuth>
            }
          />


          <Route exact path='/jobs' element={<JobsPage />} />
          <Route
            exact
            path='/payment'
            element={
              <RequireAuth>
                <CoursePaymentPage />
              </RequireAuth>
            }
          />
          <Route exact path='/tuition-jobs' element={<TuitionJobsPage />} />
          <Route exact path='/tutor' element={<TutorPage />} />
          <Route exact path='/tutor-details' element={<TutorDetailsPage />} />
          <Route exact path='/social' element={<SocialPortfolioPage />} />
          {/* Canonicalize old programme slug to hyphenated version */}
          <Route path='/gradusx/:course' element={<GradusXRedirect />} />
          <Route
            path='/:programme/:course/home/:section?/:subSection?'
            element={
              <RequireAuth>
                <CourseHomePage />
              </RequireAuth>
            }
          />
          <Route
            exact
            path='/join-class/:roomId'
            element={<JoinLiveClass />}
          />
          <Route path='/:programme/:course' element={<ProgrammeCoursePage />} />
          <Route path='/events/masterclass/:id' element={<DynamicLandingPage />} />
          <Route path='/404' element={<NotFoundPage />} />

          <Route path='*' element={<NotFoundPage />} />

        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
