/*
  Admin router
  - Centralizes admin route declarations and page wiring
  - Uses react-router to render dashboard, content, and management pages
*/
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";

const HomePageOne = lazy(() => import("./pages/HomePageOne"));

const AddUserPage = lazy(() => import("./pages/AddUserPage"));
const AlertPage = lazy(() => import("./pages/AlertPage"));
const AssignRolePage = lazy(() => import("./pages/AssignRolePage"));
const AvatarPage = lazy(() => import("./pages/AvatarPage"));
const BadgesPage = lazy(() => import("./pages/BadgesPage"));
const CoursesAdminPage = lazy(() => import("./pages/CoursesAdmin"));
const CustomizeCoursesPage = lazy(() => import("./pages/CustomizeCourses"));
const CourseAssessmentsPage = lazy(() => import("./pages/CourseAssessmentsPage"));
const CourseProgressPage = lazy(() => import("./pages/CourseProgressPage"));
const CourseEnrollmentsPage = lazy(() => import("./pages/CourseEnrollmentsPage"));
const CourseDetailDataPage = lazy(() => import("./pages/CourseDetailData"));
const ButtonPage = lazy(() => import("./pages/ButtonPage"));
const CalendarMainPage = lazy(() => import("./pages/CalendarMainPage"));
const CardPage = lazy(() => import("./pages/CardPage"));
const CarouselPage = lazy(() => import("./pages/CarouselPage"));
const ChatProfilePage = lazy(() => import("./pages/ChatProfilePage"));
const CodeGeneratorNewPage = lazy(() => import("./pages/CodeGeneratorNewPage"));
const CodeGeneratorPage = lazy(() => import("./pages/CodeGeneratorPage"));
const ColorsPage = lazy(() => import("./pages/ColorsPage"));
const ColumnChartPage = lazy(() => import("./pages/ColumnChartPage"));
const CompanyPage = lazy(() => import("./pages/CompanyPage"));
const CurrenciesPage = lazy(() => import("./pages/CurrenciesPage"));
const DropdownPage = lazy(() => import("./pages/DropdownPage"));
const ErrorPage = lazy(() => import("./pages/ErrorPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const FormLayoutPage = lazy(() => import("./pages/FormLayoutPage"));
const FormValidationPage = lazy(() => import("./pages/FormValidationPage"));
const FormPage = lazy(() => import("./pages/FormPage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));
const ImageGeneratorPage = lazy(() => import("./pages/ImageGeneratorPage"));
const ImageUploadPage = lazy(() => import("./pages/ImageUploadPage"));
const InvoiceAddPage = lazy(() => import("./pages/InvoiceAddPage"));
const InvoiceEditPage = lazy(() => import("./pages/InvoiceEditPage"));
const InvoiceListPage = lazy(() => import("./pages/InvoiceListPage"));
const InvoicePreviewPage = lazy(() => import("./pages/InvoicePreviewPage"));
const KanbanPage = lazy(() => import("./pages/KanbanPage"));
const LanguagePage = lazy(() => import("./pages/LanguagePage"));
const LineChartPage = lazy(() => import("./pages/LineChartPage"));
const ListPage = lazy(() => import("./pages/ListPage"));
const MarketplaceDetailsPage = lazy(() => import("./pages/MarketplaceDetailsPage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const NotificationAlertPage = lazy(() => import("./pages/NotificationAlertPage"));
const NotificationPage = lazy(() => import("./pages/NotificationPage"));
const PaginationPage = lazy(() => import("./pages/PaginationPage"));
const PieChartPage = lazy(() => import("./pages/PieChartPage"));
const EventRegistrationsPage = lazy(() => import("./pages/EventRegistrationsPage"));
const PaymentGatewayPage = lazy(() => import("./pages/PaymentGatewayPage"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const RadioPage = lazy(() => import("./pages/RadioPage"));
const RoleAccessPage = lazy(() => import("./pages/RoleAccessPage"));
const SignInPage = lazy(() => import("./pages/SignInPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const StarRatingPage = lazy(() => import("./pages/StarRatingPage"));
const StarredPage = lazy(() => import("./pages/StarredPage"));
const SwitchPage = lazy(() => import("./pages/SwitchPage"));
const TableBasicPage = lazy(() => import("./pages/TableBasicPage"));
const TableDataPage = lazy(() => import("./pages/TableDataPage"));
const TabsPage = lazy(() => import("./pages/TabsPage"));
const TagsPage = lazy(() => import("./pages/TagsPage"));
const TermsConditionPage = lazy(() => import("./pages/TermsConditionPage"));
const TextGeneratorPage = lazy(() => import("./pages/TextGeneratorPage"));
const ThemePage = lazy(() => import("./pages/ThemePage"));
const TooltipPage = lazy(() => import("./pages/TooltipPage"));
const TypographyPage = lazy(() => import("./pages/TypographyPage"));
const UsersGridPage = lazy(() => import("./pages/UsersGridPage"));
const UsersListPage = lazy(() => import("./pages/UsersListPage"));
const WebsiteUsersPage = lazy(() => import("./pages/WebsiteUsersPage"));
const AdminAssignmentsPage = lazy(() => import("./pages/AdminAssignmentsPage"));
const AdminJobsPage = lazy(() => import("./pages/AdminJobsPage"));
const ViewDetailsPage = lazy(() => import("./pages/ViewDetailsPage"));
const VideoGeneratorPage = lazy(() => import("./pages/VideoGeneratorPage"));
const VideosPage = lazy(() => import("./pages/VideosPage"));
const ViewProfilePage = lazy(() => import("./pages/ViewProfilePage"));
const VoiceGeneratorPage = lazy(() => import("./pages/VoiceGeneratorPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const WidgetsPage = lazy(() => import("./pages/WidgetsPage"));
const WizardPage = lazy(() => import("./pages/WizardPage"));
import RouteScrollToTop from "./helper/RouteScrollToTop";
const TextGeneratorNewPage = lazy(() => import("./pages/TextGeneratorNewPage"));
const GalleryGridPage = lazy(() => import("./pages/GalleryGridPage"));
const GalleryMasonryPage = lazy(() => import("./pages/GalleryMasonryPage"));
const GalleryHoverPage = lazy(() => import("./pages/GalleryHoverPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const BlogDetailsPage = lazy(() => import("./pages/BlogDetailsPage"));
const AddBlogPage = lazy(() => import("./pages/AddBlogPage"));
const EditBlogPage = lazy(() => import("./pages/EditBlogPage"));
const TestimonialsPage = lazy(() => import("./pages/TestimonialsPage"));
const ExpertVideosPage = lazy(() => import("./pages/ExpertVideosPage"));
const WhyGradusVideoPage = lazy(() => import("./pages/WhyGradusVideoPage"));
const LiveClassPage = lazy(() => import("./pages/LiveClassPage"));

const BannersPage = lazy(() => import("./pages/BannersPage"));
const PartnerLogosPage = lazy(() => import("./pages/PartnerLogosPage"));
const PageMetaPage = lazy(() => import("./pages/PageMetaPage"));
const EventsAdminPage = lazy(() => import("./pages/EventsAdminPage"));
const ComingSoonPage = lazy(() => import("./pages/ComingSoonPage"));
const AccessDeniedPage = lazy(() => import("./pages/AccessDeniedPage"));
const TicketsPage = lazy(() => import("./pages/TicketsPage.jsx"));
const TicketDetailsPage = lazy(() => import("./pages/TicketDetailsPage.jsx"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const BlankPagePage = lazy(() => import("./pages/BlankPagePage"));
const InquiryPage = lazy(() => import("./pages/InquiryPage"));
const PermissionPage = lazy(() => import("./pages/PermissionPage"));
const CallbackRequestPage = lazy(() => import("./pages/CallbackRequestPage"));
const SitemapManager = lazy(() => import("./pages/SitemapManager"));
import useAuth from "./hook/useAuth";
const LandingPagesListPage = lazy(() => import("./pages/LandingPagesListPage"));
const AddLandingPagePage = lazy(() => import("./pages/AddLandingPagePage"));
const EditLandingPagePage = lazy(() => import("./pages/EditLandingPagePage"));
const LandingPageRegistrationsPage = lazy(() => import("./pages/LandingPageRegistrationsPage"));

const RootDashboard = () => {
  return <HomePageOne />;
};

function App() {
  return (
    <BrowserRouter>
      <RouteScrollToTop />
      <Suspense fallback={<div className="app-loading">Loading...</div>}>
        <Routes>
          <Route exact path='/' element={<RootDashboard />} />
          <Route exact path='/permission' element={<PermissionPage />} />
          <Route exact path='/callback-requests' element={<CallbackRequestPage />} />
          <Route exact path='/sitemaps' element={<SitemapManager />} />

          {/* Courses Admin */}
          <Route exact path='/courses-admin' element={<CoursesAdminPage />} />
          {/* Customize Courses (raw JSON) */}
          <Route exact path='/customize-courses' element={<CustomizeCoursesPage />} />
          <Route exact path='/course-assessments' element={<CourseAssessmentsPage />} />
          <Route exact path='/course-progress' element={<CourseProgressPage />} />
          <Route exact path='/course-enrollments' element={<CourseEnrollmentsPage />} />
          <Route exact path='/assignments-admin' element={<AdminAssignmentsPage />} />
          <Route exact path='/jobs-admin' element={<AdminJobsPage />} />
          <Route
            path='/customize-courses/:courseKey/detailed-course-data'
            element={<CourseDetailDataPage />}
          />
          {/* SL */}
          <Route exact path='/add-user' element={<AddUserPage />} />
          <Route exact path='/alert' element={<AlertPage />} />
          <Route exact path='/assign-role' element={<AssignRolePage />} />
          <Route exact path='/permissions' element={<PermissionPage />} />
          <Route exact path='/avatar' element={<AvatarPage />} />
          <Route exact path='/badges' element={<BadgesPage />} />
          <Route exact path='/button' element={<ButtonPage />} />
          <Route exact path='/calendar-main' element={<CalendarMainPage />} />
          <Route exact path='/calendar' element={<CalendarMainPage />} />
          <Route exact path='/card' element={<CardPage />} />
          <Route exact path='/carousel' element={<CarouselPage />} />

          <Route exact path='/chat-profile' element={<ChatProfilePage />} />
          <Route exact path='/code-generator' element={<CodeGeneratorPage />} />
          <Route
            exact
            path='/code-generator-new'
            element={<CodeGeneratorNewPage />}
          />
          <Route exact path='/colors' element={<ColorsPage />} />
          <Route exact path='/column-chart' element={<ColumnChartPage />} />
          <Route exact path='/company' element={<CompanyPage />} />
          <Route exact path='/currencies' element={<CurrenciesPage />} />
          <Route exact path='/dropdown' element={<DropdownPage />} />

          <Route exact path='/faq' element={<FaqPage />} />
          <Route exact path='/forgot-password' element={<ForgotPasswordPage />} />
          <Route exact path='/form-layout' element={<FormLayoutPage />} />
          <Route exact path='/form-validation' element={<FormValidationPage />} />
          <Route exact path='/form' element={<FormPage />} />

          <Route exact path='/gallery' element={<GalleryPage />} />
          <Route exact path='/gallery-grid' element={<GalleryGridPage />} />
          <Route exact path='/gallery-masonry' element={<GalleryMasonryPage />} />
          <Route exact path='/gallery-hover' element={<GalleryHoverPage />} />

          <Route exact path='/blog' element={<BlogPage />} />
          <Route exact path='/blog/:blogId' element={<BlogDetailsPage />} />
          <Route exact path='/blog-details/:blogId' element={<BlogDetailsPage />} />
          <Route exact path='/add-blog' element={<AddBlogPage />} />
          <Route exact path='/edit-blog/:blogId' element={<EditBlogPage />} />
          <Route exact path='/inquiries' element={<InquiryPage />} />
          <Route exact path='/inquiries' element={<InquiryPage />} />
          <Route exact path='/callback-requests' element={<CallbackRequestPage />} />
          <Route exact path='/event-registrations' element={<EventRegistrationsPage />} />
          <Route exact path='/tickets' element={<TicketsPage />} />
          <Route exact path='/ticket/:id' element={<TicketDetailsPage />} />
          { /* Courses management and enrollments pages removed */}

          <Route exact path='/testimonials' element={<TestimonialsPage />} />
          <Route exact path='/expert-videos' element={<ExpertVideosPage />} />
          <Route exact path='/why-gradus-video' element={<WhyGradusVideoPage />} />
          <Route exact path='/live-class' element={<LiveClassPage />} />

          <Route exact path='/banners' element={<BannersPage />} />
          <Route exact path='/page-meta' element={<PageMetaPage />} />
          <Route exact path='/partner-logos' element={<PartnerLogosPage />} />
          <Route exact path='/events-admin' element={<EventsAdminPage />} />
          <Route exact path='/coming-soon' element={<ComingSoonPage />} />
          <Route exact path='/access-denied' element={<AccessDeniedPage />} />
          <Route exact path='/maintenance' element={<MaintenancePage />} />
          <Route exact path='/blank-page' element={<BlankPagePage />} />

          <Route exact path='/image-generator' element={<ImageGeneratorPage />} />
          <Route exact path='/image-upload' element={<ImageUploadPage />} />
          <Route exact path='/invoice-add' element={<InvoiceAddPage />} />
          <Route exact path='/invoice-edit' element={<InvoiceEditPage />} />
          <Route exact path='/invoice-list' element={<InvoiceListPage />} />
          <Route exact path='/invoice-preview' element={<InvoicePreviewPage />} />
          <Route exact path='/kanban' element={<KanbanPage />} />
          <Route exact path='/language' element={<LanguagePage />} />
          <Route exact path='/line-chart' element={<LineChartPage />} />
          <Route exact path='/list' element={<ListPage />} />
          <Route
            exact
            path='/marketplace-details'
            element={<MarketplaceDetailsPage />}
          />
          <Route exact path='/marketplace' element={<MarketplacePage />} />
          <Route
            exact
            path='/notification-alert'
            element={<NotificationAlertPage />}
          />
          <Route exact path='/notification' element={<NotificationPage />} />
          <Route exact path='/pagination' element={<PaginationPage />} />
          <Route exact path='/payment-gateway' element={<PaymentGatewayPage />} />
          <Route exact path='/pie-chart' element={<PieChartPage />} />
          <Route exact path='/portfolio' element={<PortfolioPage />} />
          <Route exact path='/pricing' element={<PricingPage />} />
          <Route exact path='/progress' element={<ProgressPage />} />
          <Route exact path='/radio' element={<RadioPage />} />
          <Route exact path='/role-access' element={<RoleAccessPage />} />
          <Route exact path='/sign-in' element={<SignInPage />} />
          <Route exact path='/sign-up' element={<SignUpPage />} />
          <Route exact path='/star-rating' element={<StarRatingPage />} />
          <Route exact path='/starred' element={<StarredPage />} />
          <Route exact path='/switch' element={<SwitchPage />} />
          <Route exact path='/table-basic' element={<TableBasicPage />} />
          <Route exact path='/table-data' element={<TableDataPage />} />
          <Route exact path='/tabs' element={<TabsPage />} />
          <Route exact path='/tags' element={<TagsPage />} />
          <Route exact path='/terms-condition' element={<TermsConditionPage />} />
          <Route
            exact
            path='/text-generator-new'
            element={<TextGeneratorNewPage />}
          />
          <Route exact path='/text-generator' element={<TextGeneratorPage />} />
          <Route exact path='/theme' element={<ThemePage />} />
          <Route exact path='/tooltip' element={<TooltipPage />} />
          <Route exact path='/typography' element={<TypographyPage />} />
          <Route exact path='/users-grid' element={<UsersGridPage />} />
          <Route exact path='/users-list' element={<UsersListPage />} />
          <Route exact path='/website-users' element={<WebsiteUsersPage />} />
          <Route exact path='/view-details' element={<ViewDetailsPage />} />
          <Route exact path='/video-generator' element={<VideoGeneratorPage />} />
          <Route exact path='/videos' element={<VideosPage />} />
          <Route exact path='/view-profile' element={<ViewProfilePage />} />
          <Route exact path='/voice-generator' element={<VoiceGeneratorPage />} />
          <Route exact path='/wallet' element={<WalletPage />} />
          <Route exact path='/widgets' element={<WidgetsPage />} />
          <Route exact path='/wizard' element={<WizardPage />} />

          <Route exact path='*' element={<ErrorPage />} />

          {/* Landing Pages */}
          <Route exact path='/landing-pages' element={<LandingPagesListPage />} />
          <Route exact path='/add-landing-page' element={<AddLandingPagePage />} />
          <Route exact path='/edit-landing-page/:slug' element={<EditLandingPagePage />} />
          <Route exact path='/landing-page-registrations' element={<LandingPageRegistrationsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;



