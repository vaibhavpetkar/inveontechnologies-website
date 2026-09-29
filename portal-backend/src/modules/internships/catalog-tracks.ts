import type { RoadmapPhase } from "../shared/db/schema.js";

export interface TrackSeed {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  roadmap: RoadmapPhase[];
}

/** The six 6-month internship tracks; each month of the roadmap covers one or two skills. */
export const TRACKS: TrackSeed[] = [
  {
    slug: "full-stack-javascript",
    title: "Full Stack JavaScript",
    tagline: "HTML, CSS, JavaScript, React, Node.js, Express and MySQL",
    description: "Build complete web applications in JavaScript: responsive front ends in React and REST APIs in Node.js and Express on MySQL, shipped with Docker and CI.",
    roadmap: [
      { month: 1, title: "Web foundations", skills: ["html", "css"] },
      { month: 2, title: "JavaScript and UI frameworks", skills: ["javascript", "bootstrap"] },
      { month: 3, title: "Front end with React", skills: ["react"] },
      { month: 4, title: "Back end with Node.js", skills: ["node_express"] },
      { month: 5, title: "Databases", skills: ["mysql"] },
      { month: 6, title: "Ship it", skills: ["devops"] },
    ],
  },
  {
    slug: "python-full-stack",
    title: "Python Full Stack with Django",
    tagline: "Python, Django, REST APIs, MySQL and deployment",
    description: "Learn Python properly, then build and deploy database-backed web apps and APIs with Django and Django REST Framework.",
    roadmap: [
      { month: 1, title: "Web foundations", skills: ["html", "css"] },
      { month: 2, title: "Python programming", skills: ["python"] },
      { month: 3, title: "JavaScript for the browser", skills: ["javascript"] },
      { month: 4, title: "Web apps with Django", skills: ["django"] },
      { month: 5, title: "Databases", skills: ["mysql"] },
      { month: 6, title: "Deploy and automate", skills: ["devops"] },
    ],
  },
  {
    slug: "java-full-stack",
    title: "Java Full Stack with Spring Boot",
    tagline: "Core and Advanced Java, Spring Boot, MySQL and React",
    description: "Go from Core Java to production-style Spring Boot services with JPA, security and tests, and connect them to a React front end.",
    roadmap: [
      { month: 1, title: "Core Java", skills: ["java_core"] },
      { month: 2, title: "Advanced Java", skills: ["java_advanced"] },
      { month: 3, title: "Databases", skills: ["mysql"] },
      { month: 4, title: "Services with Spring Boot", skills: ["spring_boot"] },
      { month: 5, title: "Front end", skills: ["html", "javascript"] },
      { month: 6, title: "React client", skills: ["react"] },
    ],
  },
  {
    slug: "frontend-react",
    title: "Frontend Development with React",
    tagline: "HTML, CSS, Bootstrap, JavaScript and React",
    description: "Become a front-end developer: accessible, responsive pages, solid JavaScript, and modern React apps deployed to the web.",
    roadmap: [
      { month: 1, title: "HTML that holds up", skills: ["html"] },
      { month: 2, title: "Layout and design with CSS", skills: ["css"] },
      { month: 3, title: "Bootstrap", skills: ["bootstrap"] },
      { month: 4, title: "JavaScript", skills: ["javascript"] },
      { month: 5, title: "React basics", skills: ["react"] },
      { month: 6, title: "React projects and deployment", skills: ["devops"] },
    ],
  },
  {
    slug: "programming-c-cpp-csharp",
    title: "Programming in C, C++ and C#",
    tagline: "C, C++, C# and SQL fundamentals",
    description: "Strong programming foundations: memory and pointers in C, object-oriented design and the STL in C++, and modern .NET with C#.",
    roadmap: [
      { month: 1, title: "C basics", skills: ["c"] },
      { month: 2, title: "Pointers, structs and files", skills: ["c"] },
      { month: 3, title: "C++ and OOP", skills: ["cpp"] },
      { month: 4, title: "C# and .NET", skills: ["csharp"] },
      { month: 5, title: "Databases", skills: ["mysql"] },
      { month: 6, title: "Capstone", skills: ["cpp", "csharp"] },
    ],
  },
  {
    slug: "devops-cloud",
    title: "DevOps and Cloud",
    tagline: "Linux, Python scripting, Docker, CI/CD and AWS",
    description: "Automate, containerise and deploy: Linux and scripting, Docker and Compose, GitHub Actions pipelines, and core AWS services with infrastructure as code.",
    roadmap: [
      { month: 1, title: "Scripting with Python", skills: ["python"] },
      { month: 2, title: "Linux, Git and Docker", skills: ["devops"] },
      { month: 3, title: "Databases for operators", skills: ["mysql"] },
      { month: 4, title: "Cloud foundations", skills: ["cloud"] },
      { month: 5, title: "Back-end services to deploy", skills: ["node_express"] },
      { month: 6, title: "Production on the cloud", skills: ["cloud", "devops"] },
    ],
  },
];

/** A track's skills in roadmap order, each once. */
export function trackSkills(roadmap: RoadmapPhase[]) {
  return [...new Set(roadmap.flatMap((p) => p.skills))];
}
