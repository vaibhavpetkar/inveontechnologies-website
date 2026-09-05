import type { RoleId } from '@/data/careerRoles';

export interface Question {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  type: 'mcq' | 'scenario';
}

type QuestionBank = Record<RoleId, Question[]>;

export const APTITUDE_QUESTIONS: QuestionBank = {
  frontend: [
    { id: 1, question: 'What hook should you use to fetch data when a React component mounts?', options: ['useState', 'useEffect', 'useMemo', 'useCallback'], correctIndex: 1, type: 'mcq' },
    { id: 2, question: 'In Next.js App Router, which file convention creates a shared layout?', options: ['page.tsx', 'layout.tsx', 'template.tsx', 'loading.tsx'], correctIndex: 1, type: 'mcq' },
    { id: 3, question: 'A product list re-renders on every keystroke in a search box. Best fix?', options: ['Remove the search box', 'Debounce input and memoize the list with useMemo/React.memo', 'Use class components', 'Add more useState calls'], correctIndex: 1, type: 'scenario' },
    { id: 4, question: 'Which CSS approach is scoped by default in Next.js without extra setup?', options: ['Global CSS only', 'CSS Modules', 'Inline styles only', 'Styled Components only'], correctIndex: 1, type: 'mcq' },
    { id: 5, question: 'What does SSR stand for in Next.js context?', options: ['Static Site Rendering', 'Server-Side Rendering', 'Single Source Routing', 'Secure Session Request'], correctIndex: 1, type: 'mcq' },
    { id: 6, question: 'Users report flash of unstyled content (FOUC). Likely cause?', options: ['Missing CSS import or hydration mismatch', 'Too many API calls', 'Using TypeScript', 'Using Tailwind'], correctIndex: 0, type: 'scenario' },
    { id: 7, question: 'Which React pattern avoids prop drilling for theme data?', options: ['Context API', 'Multiple refs', 'DangerouslySetInnerHTML', 'Key prop'], correctIndex: 0, type: 'mcq' },
    { id: 8, question: 'What is the purpose of the key prop in lists?', options: ['Style elements', 'Help React identify which items changed', 'Enable animations only', 'Prevent XSS'], correctIndex: 1, type: 'mcq' },
    { id: 9, question: 'An API returns 401 on client fetch. First step in Next.js app?', options: ['Ignore it', 'Check auth token/cookies and middleware', 'Delete the page', 'Switch to Vue'], correctIndex: 1, type: 'scenario' },
    { id: 10, question: 'Which hook memoizes a computed value?', options: ['useEffect', 'useMemo', 'useRef', 'useLayoutEffect'], correctIndex: 1, type: 'mcq' },
    { id: 11, question: 'Tailwind utility "flex items-center justify-between" does what?', options: ['Creates grid', 'Flex row with vertical center and space between', 'Hides overflow', 'Adds border'], correctIndex: 1, type: 'mcq' },
    { id: 12, question: 'Lighthouse shows poor LCP. Which action helps most?', options: ['Add more fonts', 'Optimize hero image size and use priority loading', 'Remove meta tags', 'Disable JavaScript'], correctIndex: 1, type: 'scenario' },
    { id: 13, question: 'What is React Server Components primary benefit?', options: ['Run all code in browser', 'Reduce client JS bundle by rendering on server', 'Replace HTML', 'Remove need for CSS'], correctIndex: 1, type: 'mcq' },
    { id: 14, question: 'Which state library is commonly paired with React for global state?', options: ['Redux/Zustand', 'jQuery', 'Lodash', 'Axios'], correctIndex: 0, type: 'mcq' },
    { id: 15, question: 'Form submits twice on button click. Best fix?', options: ['Add duplicate buttons', 'Prevent default and disable button while submitting', 'Remove validation', 'Use GET method'], correctIndex: 1, type: 'scenario' },
    { id: 16, question: 'What does TypeScript strict mode help catch?', options: ['CSS errors', 'Null/undefined type errors at compile time', 'Network failures', 'SEO issues'], correctIndex: 1, type: 'mcq' },
    { id: 17, question: 'Dynamic import in Next.js is used for:', options: ['Code splitting / lazy loading', 'Database queries', 'Email sending', 'File uploads only'], correctIndex: 0, type: 'mcq' },
    { id: 18, question: 'Accessibility: interactive div needs what to be keyboard accessible?', options: ['tabIndex and keyboard handlers or use button', 'Only aria-label', 'Higher z-index', 'Inline onclick only'], correctIndex: 0, type: 'scenario' },
    { id: 19, question: 'Which HTTP method is idempotent?', options: ['POST', 'PUT', 'PATCH with side effects', 'None'], correctIndex: 1, type: 'mcq' },
    { id: 20, question: 'Client asks for SEO-friendly blog. Next.js approach?', options: ['Client-only SPA with no routes', 'SSG/SSR pages with metadata API', 'iframe embed', 'PDF only'], correctIndex: 1, type: 'scenario' },
  ],
  backend: [
    { id: 1, question: 'Which HTTP status code indicates successful resource creation?', options: ['200', '201', '204', '400'], correctIndex: 1, type: 'mcq' },
    { id: 2, question: 'What is the main purpose of an API gateway?', options: ['Store files', 'Single entry point for routing, auth, rate limiting', 'Replace database', 'Compile code'], correctIndex: 1, type: 'mcq' },
    { id: 3, question: 'High traffic API returns 503. First investigation step?', options: ['Rewrite in another language', 'Check service health, load, and connection pools', 'Disable logging', 'Remove authentication'], correctIndex: 1, type: 'scenario' },
    { id: 4, question: 'Which database index type speeds up equality lookups on a column?', options: ['Full table scan', 'B-tree index', 'CSV export', 'View'], correctIndex: 1, type: 'mcq' },
    { id: 5, question: 'JWT access tokens should typically be:', options: ['Stored forever in localStorage without expiry', 'Short-lived with refresh token strategy', 'Hardcoded in source', 'Shared publicly'], correctIndex: 1, type: 'mcq' },
    { id: 6, question: 'Microservice A calls B synchronously in a chain of 5 services. Risk?', options: ['Better performance always', 'Cascading latency and failure propagation', 'No risk', 'Automatic caching'], correctIndex: 1, type: 'scenario' },
    { id: 7, question: 'Which Go construct is best for concurrent tasks with result collection?', options: ['Single thread only', 'Goroutines with channels', 'Global variables', 'init() only'], correctIndex: 1, type: 'mcq' },
    { id: 8, question: 'SQL injection is prevented by:', options: ['String concatenation', 'Parameterized queries / prepared statements', 'More comments', 'Bigger passwords'], correctIndex: 1, type: 'mcq' },
    { id: 9, question: 'Redis is commonly used for:', options: ['Long-term archival only', 'Caching, sessions, pub/sub', 'Spreadsheets', 'Video encoding'], correctIndex: 1, type: 'mcq' },
    { id: 10, question: 'Order API processes payment then inventory fails. Best pattern?', options: ['Ignore failure', 'Distributed transaction / saga with compensation', 'Delete orders table', 'Manual SQL only'], correctIndex: 1, type: 'scenario' },
    { id: 11, question: 'RESTful design: updating entire resource uses:', options: ['GET', 'PUT/PATCH', 'CONNECT', 'TRACE'], correctIndex: 1, type: 'mcq' },
    { id: 12, question: 'Node.js event loop handles I/O by:', options: ['Blocking threads per request', 'Non-blocking async I/O with thread pool for some ops', 'No concurrency', 'Only WebSockets'], correctIndex: 1, type: 'mcq' },
    { id: 13, question: 'Python FastAPI advantage over plain Flask for APIs?', options: ['No typing', 'Automatic OpenAPI docs and Pydantic validation', 'No async support', 'Requires Java'], correctIndex: 1, type: 'mcq' },
    { id: 14, question: 'Database N+1 query problem occurs when:', options: ['One query fetches all related data efficiently', 'Loop triggers one query per item for relations', 'Using indexes', 'Using connection pooling'], correctIndex: 1, type: 'scenario' },
    { id: 15, question: 'Which is NOT a valid microservice communication style?', options: ['HTTP/REST', 'gRPC', 'Message queues', 'Direct shared mutable memory across services'], correctIndex: 3, type: 'mcq' },
    { id: 16, question: 'Rate limiting protects APIs from:', options: ['Valid users only', 'Abuse, DDoS, and cost overruns', 'HTTPS', 'JSON parsing'], correctIndex: 1, type: 'mcq' },
    { id: 17, question: 'Logs show duplicate charge webhooks. Solution?', options: ['Process every webhook blindly', 'Idempotency keys on payment handler', 'Disable webhooks', 'Delete logs'], correctIndex: 1, type: 'scenario' },
    { id: 18, question: 'ACID in databases stands for:', options: ['Atomicity, Consistency, Isolation, Durability', 'API, Cache, Index, Data', 'Always Connect Immediately Direct', 'None'], correctIndex: 0, type: 'mcq' },
    { id: 19, question: 'Environment secrets in production should be:', options: ['In git repository', 'In environment variables / secret manager', 'In client-side JS', 'In README'], correctIndex: 1, type: 'mcq' },
    { id: 20, question: 'API p99 latency spikes at peak hours. Practical fix?', options: ['Add caching, optimize slow queries, scale horizontally', 'Remove monitoring', 'Use only synchronous calls', 'Disable peak hours'], correctIndex: 0, type: 'scenario' },
  ],
  fullstack: [
    { id: 1, question: 'Full-stack app needs auth. Secure approach?', options: ['HTTP-only cookies or secure token storage with HTTPS', 'Password in URL', 'Plain text passwords in DB', 'Auth only on frontend'], correctIndex: 0, type: 'mcq' },
    { id: 2, question: 'You deploy frontend and backend separately. CORS error appears. Fix?', options: ['Disable browser security', 'Configure allowed origins on backend', 'Remove API', 'Use only GET'], correctIndex: 1, type: 'scenario' },
    { id: 3, question: 'Which tool orchestrates multi-container local dev?', options: ['Docker Compose', 'Notepad', 'FTP only', 'Cron only'], correctIndex: 0, type: 'mcq' },
    { id: 4, question: 'React form posts to Express API. Validation should happen:', options: ['Frontend only', 'Both client (UX) and server (security)', 'Never', 'Database only'], correctIndex: 1, type: 'mcq' },
    { id: 5, question: 'User uploads 50MB file crashing server. Solution?', options: ['Increase RAM only', 'Stream upload, size limits, object storage (S3)', 'Base64 in JSON', 'Email the file'], correctIndex: 1, type: 'scenario' },
    { id: 6, question: 'Prisma/ORM primarily helps with:', options: ['CSS styling', 'Type-safe database access', 'Image compression', 'DNS'], correctIndex: 1, type: 'mcq' },
    { id: 7, question: 'WebSocket vs HTTP polling for chat app?', options: ['Polling always better', 'WebSocket for real-time bidirectional communication', 'Neither works', 'Email only'], correctIndex: 1, type: 'mcq' },
    { id: 8, question: 'Build pipeline should include:', options: ['Lint, test, build, deploy stages', 'Only manual FTP', 'Delete source after deploy', 'Skip tests for speed always'], correctIndex: 0, type: 'mcq' },
    { id: 9, question: 'Dashboard loads slowly due to 10 sequential API calls. Fix?', options: ['More sequential calls', 'Parallelize requests or create aggregated endpoint', 'Remove dashboard', 'Add loading spinner only'], correctIndex: 1, type: 'scenario' },
    { id: 10, question: 'PostgreSQL vs MongoDB: relational data with joins fits:', options: ['MongoDB always', 'PostgreSQL (relational)', 'Neither', 'CSV files'], correctIndex: 1, type: 'mcq' },
    { id: 11, question: 'Next.js API routes are useful for:', options: ['BFF layer hiding secrets from client', 'Replacing all databases', 'Desktop apps', 'Mobile native code'], correctIndex: 0, type: 'mcq' },
    { id: 12, question: 'Session fixation attack prevented by:', options: ['Reusing session ID after login', 'Regenerating session ID on authentication', 'Public session IDs', 'No sessions'], correctIndex: 1, type: 'mcq' },
    { id: 13, question: 'E-commerce checkout: payment fails after order created. Best approach?', options: ['Charge anyway', 'Order status workflow with pending/failed states and retry', 'Delete user account', 'Hide error'], correctIndex: 1, type: 'scenario' },
    { id: 14, question: 'GraphQL advantage over REST for mobile clients?', options: ['Always slower', 'Fetch exactly needed fields in one request', 'No schema', 'No caching possible'], correctIndex: 1, type: 'mcq' },
    { id: 15, question: 'Which env var pattern is correct for Vite frontend secrets?', options: ['VITE_ prefix for public vars; secrets on server only', 'All secrets in VITE_', 'Hardcode in components', 'Commit .env to git'], correctIndex: 0, type: 'mcq' },
    { id: 16, question: 'Database migration tools (Flyway/Prisma migrate) ensure:', options: ['Random schema changes', 'Version-controlled, repeatable schema updates', 'No backups needed', 'Manual SQL only'], correctIndex: 1, type: 'mcq' },
    { id: 17, question: 'Admin panel exposed publicly without auth. Immediate action?', options: ['Add authentication, RBAC, and restrict network access', 'Share link on social media', 'Remove HTTPS', 'Ignore'], correctIndex: 0, type: 'scenario' },
    { id: 18, question: 'Horizontal scaling means:', options: ['Bigger single server only', 'Adding more server instances', 'Deleting data', 'Using one thread'], correctIndex: 1, type: 'mcq' },
    { id: 19, question: 'CSRF protection typically uses:', options: ['CSRF tokens or SameSite cookies', 'Public POST endpoints', 'GET for mutations', 'No cookies'], correctIndex: 0, type: 'mcq' },
    { id: 20, question: 'Startup MVP needs fast iteration. Sensible stack choice?', options: ['Proven full-stack (React + Node) with managed DB and CI', 'Custom OS kernel first', 'No version control', 'Manual deployments only'], correctIndex: 0, type: 'scenario' },
  ],
  mobile: [
    { id: 1, question: 'Flutter uses which language primarily?', options: ['JavaScript', 'Dart', 'Swift only', 'Kotlin only'], correctIndex: 1, type: 'mcq' },
    { id: 2, question: 'React Native bridges to:', options: ['Native platform APIs via bridge/new architecture', 'Only web DOM', 'Mainframe', 'Blockchain only'], correctIndex: 0, type: 'mcq' },
    { id: 3, question: 'App rejected for missing privacy policy on App Store. Fix?', options: ['Remove app', 'Add privacy policy URL and required disclosures in store listing', 'Ignore Apple', 'Use sideload only'], correctIndex: 1, type: 'scenario' },
    { id: 4, question: 'Which widget is Flutter equivalent of React component?', options: ['Widget', 'Controller', 'Servlet', 'Module'], correctIndex: 0, type: 'mcq' },
    { id: 5, question: 'Offline-first mobile app sync strategy?', options: ['Require network always', 'Local cache with background sync when online', 'Delete data offline', 'SMS sync'], correctIndex: 1, type: 'mcq' },
    { id: 6, question: 'Push notifications on iOS require:', options: ['APNs certificates/keys and user permission', 'Only email', 'FTP', 'Bluetooth only'], correctIndex: 0, type: 'mcq' },
    { id: 7, question: 'App jank on scroll with large lists. Flutter fix?', options: ['ListView.builder for lazy rendering', 'Load all 10000 items at once', 'Disable scroll', 'Use images only'], correctIndex: 0, type: 'scenario' },
    { id: 8, question: 'Deep linking allows:', options: ['Opening specific app screens from URLs', 'Deleting app data', 'Bypassing store review', 'Root access'], correctIndex: 0, type: 'mcq' },
    { id: 9, question: 'React Native Hermes engine improves:', options: ['Startup time and memory on Android/iOS', 'Desktop gaming', 'Server-side rendering', 'SQL queries'], correctIndex: 0, type: 'mcq' },
    { id: 10, question: 'Play Store 64-bit requirement means:', options: ['Ship native 64-bit binaries where required', '32-bit only', 'Web app only', 'No native code'], correctIndex: 0, type: 'mcq' },
    { id: 11, question: 'Location permission denied. UX best practice?', options: ['Crash app', 'Graceful degradation with explanation and settings link', 'Infinite permission prompts', 'Hide all features'], correctIndex: 1, type: 'scenario' },
    { id: 12, question: 'Firebase Auth provides:', options: ['Email, phone, social login SDKs', 'Only payments', 'Only analytics', 'Only hosting'], correctIndex: 0, type: 'mcq' },
    { id: 13, question: 'App size too large for users on slow networks. Reduce by:', options: ['Asset optimization, split APK/App Bundle, remove unused deps', 'Add more images', 'Include all locales always', 'Duplicate libraries'], correctIndex: 0, type: 'mcq' },
    { id: 14, question: 'State management in Flutter often uses:', options: ['Provider, Riverpod, or Bloc', 'Global variables only', 'No state', 'FTP'], correctIndex: 0, type: 'mcq' },
    { id: 15, question: 'Biometric login fails on some devices. Fallback?', options: ['Lock user out permanently', 'PIN/password fallback with secure storage', 'Remove login', 'Store password in plain text'], correctIndex: 1, type: 'scenario' },
    { id: 16, question: 'Expo in React Native helps with:', options: ['Managed workflow and OTA updates', 'Kernel development', 'Database admin only', 'iOS-only development'], correctIndex: 0, type: 'mcq' },
    { id: 17, question: 'Platform-specific UI guidelines: Material vs Cupertino refers to:', options: ['Android vs iOS design languages', 'Windows vs Linux', 'Backend vs frontend', 'SQL vs NoSQL'], correctIndex: 0, type: 'mcq' },
    { id: 18, question: 'Crash reports in production collected via:', options: ['Firebase Crashlytics / Sentry', 'User emails only', 'No monitoring', 'Console.log in prod'], correctIndex: 0, type: 'mcq' },
    { id: 19, question: 'Camera feature needs testing on real devices because:', options: ['Emulators miss hardware/sensor behavior', 'Simulators are always identical', 'No testing needed', 'Web is same as mobile'], correctIndex: 0, type: 'scenario' },
    { id: 20, question: 'App store release checklist includes:', options: ['Version bump, changelog, screenshots, privacy, signing', 'Only upload APK', 'Delete old versions from users', 'Skip review'], correctIndex: 0, type: 'mcq' },
  ],
  devops: [
    { id: 1, question: 'Kubernetes Pod is:', options: ['Smallest deployable unit running containers', 'Physical server', 'DNS record', 'SQL table'], correctIndex: 0, type: 'mcq' },
    { id: 2, question: 'CI/CD pipeline primary goal?', options: ['Automate build, test, and deployment', 'Manual FTP uploads', 'Remove git', 'Disable tests'], correctIndex: 0, type: 'mcq' },
    { id: 3, question: 'Production deployment fails health checks. First step?', options: ['Roll back to last stable version and investigate logs', 'Force traffic anyway', 'Delete cluster', 'Ignore alerts'], correctIndex: 0, type: 'scenario' },
    { id: 4, question: 'Docker image vs container:', options: ['Image is template; container is running instance', 'Same thing', 'Container is template', 'Image is running process'], correctIndex: 0, type: 'mcq' },
    { id: 5, question: 'AWS S3 is used for:', options: ['Object storage', 'Relational queries only', 'GPU compute only', 'Email server only'], correctIndex: 0, type: 'mcq' },
    { id: 6, question: 'Infrastructure as Code tool example:', options: ['Terraform', 'Manual clicking only', 'Excel only', 'Notepad'], correctIndex: 0, type: 'mcq' },
    { id: 7, question: 'High CPU on K8s node. Scaling options?', options: ['HPA/VPA and add nodes to cluster', 'Delete pods randomly', 'Stop monitoring', 'Single giant VM only forever'], correctIndex: 0, type: 'scenario' },
    { id: 8, question: 'Blue-green deployment reduces:', options: ['Downtime during releases', 'Security', 'Backups', 'Documentation'], correctIndex: 0, type: 'mcq' },
    { id: 9, question: 'Secrets in Kubernetes should be stored in:', options: ['Secrets resource / external secret manager', 'ConfigMap with public access', 'Dockerfile ENV committed to git', 'README'], correctIndex: 0, type: 'mcq' },
    { id: 10, question: 'GCP Cloud Run is suitable for:', options: ['Containerized HTTP services with auto-scaling', 'Bare metal only', 'Desktop apps', 'Blockchain mining'], correctIndex: 0, type: 'mcq' },
    { id: 11, question: 'GitHub Actions workflow triggered on push to main should:', options: ['Run tests before deploy to production', 'Skip all checks', 'Delete repository', 'Only run on Fridays'], correctIndex: 0, type: 'mcq' },
    { id: 12, question: 'Disk full on logging server. Action?', options: ['Log rotation, retention policy, centralize logs', 'Disable all logs permanently', 'Copy logs to email', 'Ignore'], correctIndex: 0, type: 'scenario' },
    { id: 13, question: 'Load balancer distributes traffic for:', options: ['High availability and scalability', 'Encryption only', 'Code compilation', 'Git merges'], correctIndex: 0, type: 'mcq' },
    { id: 14, question: 'Prometheus is used for:', options: ['Metrics collection and alerting', 'Word processing', 'Image editing', 'Email'], correctIndex: 0, type: 'mcq' },
    { id: 15, question: 'Zero-downtime DB migration often uses:', options: ['Expand-contract pattern with backward compatible changes', 'Drop table first', 'No backups', 'Manual prod edits only'], correctIndex: 0, type: 'mcq' },
    { id: 16, question: 'Container registry purpose:', options: ['Store and distribute Docker images', 'Run unit tests only', 'Host static website only', 'Replace Kubernetes'], correctIndex: 0, type: 'mcq' },
    { id: 17, question: 'SSL certificate expired on production domain. Impact and fix?', options: ['Users see trust errors; renew cert via ACM/Let\'s Encrypt immediately', 'No impact', 'Delete domain', 'Disable HTTPS'], correctIndex: 0, type: 'scenario' },
    { id: 18, question: 'IAM least privilege means:', options: ['Grant minimum permissions required', 'Admin access for everyone', 'Public S3 buckets', 'Shared root password'], correctIndex: 0, type: 'mcq' },
    { id: 19, question: 'Helm charts help with:', options: ['Packaging Kubernetes applications', 'Mobile UI design', 'CSS frameworks', 'SQL queries'], correctIndex: 0, type: 'mcq' },
    { id: 20, question: 'Disaster recovery plan should include:', options: ['Backups, RTO/RPO targets, tested restore procedures', 'Hope for the best', 'No documentation', 'Single region only with no backups'], correctIndex: 0, type: 'scenario' },
  ],
  qa: [
    { id: 1, question: 'Test pyramid suggests more:', options: ['Unit tests at base, fewer E2E at top', 'Only manual tests', 'Only E2E tests', 'No automation'], correctIndex: 0, type: 'mcq' },
    { id: 2, question: 'Cypress is primarily used for:', options: ['End-to-end browser testing', 'Database migrations', 'Server provisioning', 'Mobile native only'], correctIndex: 0, type: 'mcq' },
    { id: 3, question: 'Flaky test passes sometimes, fails randomly. First action?', options: ['Isolate test, fix async waits and test data dependencies', 'Delete all tests', 'Ignore failures', 'Disable CI'], correctIndex: 0, type: 'scenario' },
    { id: 4, question: 'Playwright advantage includes:', options: ['Cross-browser automation with auto-wait', 'Only IE6 support', 'No headless mode', 'Manual only'], correctIndex: 0, type: 'mcq' },
    { id: 5, question: 'Regression testing ensures:', options: ['New changes did not break existing functionality', 'Only new features work once', 'Code has no bugs ever', 'Skip old tests'], correctIndex: 0, type: 'mcq' },
    { id: 6, question: 'Selenium WebDriver interacts with browsers via:', options: ['Browser drivers and W3C WebDriver protocol', 'Direct DOM injection only', 'FTP', 'Email'], correctIndex: 0, type: 'mcq' },
    { id: 7, question: 'Login test fails after UI redesign. Likely cause?', options: ['Broken selectors; update locators to stable attributes', 'Browser too fast', 'Tests run too slow', 'Remove assertions'], correctIndex: 0, type: 'scenario' },
    { id: 8, question: 'API testing with Postman/Newman validates:', options: ['Status codes, response schema, and business rules', 'Only CSS', 'Only images', 'Git history'], correctIndex: 0, type: 'mcq' },
    { id: 9, question: 'Boundary value analysis tests:', options: ['Edge cases at limits of input ranges', 'Only happy path', 'Marketing copy', 'Logo colors'], correctIndex: 0, type: 'mcq' },
    { id: 10, question: 'Page Object Model pattern helps:', options: ['Maintainable test code by encapsulating UI locators', 'Slower tests always', 'Remove reusability', 'Skip page loads'], correctIndex: 0, type: 'mcq' },
    { id: 11, question: 'CI fails on test suite taking 2 hours. Improvement?', options: ['Parallelize tests and prioritize critical paths', 'Run tests manually only', 'Remove assertions', 'Add sleep(3600)'], correctIndex: 0, type: 'scenario' },
    { id: 12, question: 'Accessibility testing checks:', options: ['WCAG compliance, screen reader support, keyboard nav', 'Only pixel colors', 'Server CPU', 'Git branches'], correctIndex: 0, type: 'mcq' },
    { id: 13, question: 'Mocking in unit tests is used to:', options: ['Isolate code under test from external dependencies', 'Test production DB directly', 'Skip assertions', 'Run in production only'], correctIndex: 0, type: 'mcq' },
    { id: 14, question: 'Bug severity vs priority: critical production outage is:', options: ['High severity and usually high priority', 'Low priority always', 'Cosmetic only', 'Won\'t fix'], correctIndex: 0, type: 'mcq' },
    { id: 15, question: 'Payment flow E2E should use:', options: ['Test/sandbox environment, never real cards in automation', 'Production with real money', 'No verification', 'Random users\' cards'], correctIndex: 0, type: 'scenario' },
    { id: 16, question: 'Jest is commonly used for:', options: ['JavaScript unit and integration testing', 'Kubernetes deploys', 'Docker builds', 'CSS only'], correctIndex: 0, type: 'mcq' },
    { id: 17, question: 'Test data management best practice:', options: ['Seed/cleanup test data per run for isolation', 'Use production data unmasked', 'Never reset DB', 'Share one user for all parallel tests'], correctIndex: 0, type: 'mcq' },
    { id: 18, question: 'Exploratory testing is:', options: ['Simultaneous learning, design, and execution of tests', 'Fully scripted only', 'No human involvement', 'Load testing only'], correctIndex: 0, type: 'mcq' },
    { id: 19, question: 'Visual regression tools (Percy/Chromatic) detect:', options: ['Unintended UI screenshot differences', 'SQL injection', 'Memory leaks in kernel', 'DNS issues'], correctIndex: 0, type: 'mcq' },
    { id: 20, question: 'Release blocked by one failing critical test. QA recommendation?', options: ['Fix or quarantine with approval; do not ship known critical defect', 'Ship anyway', 'Delete test', 'Disable production'], correctIndex: 0, type: 'scenario' },
  ],
};

export function getQuestionsForRole(roleId: RoleId): Question[] {
  return APTITUDE_QUESTIONS[roleId] ?? [];
}

export function calculateScore(roleId: RoleId, answers: Record<number, number>): { score: number; total: number; percentage: number } {
  const questions = getQuestionsForRole(roleId);
  let score = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctIndex) score++;
  }
  const total = questions.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  return { score, total, percentage };
}
