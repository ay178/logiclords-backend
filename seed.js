/**
 * Seed script — populates MongoDB with demo data
 * Usage: node seed.js [--reset]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Member   = require('./models/Member');
const Project  = require('./models/Project');
const Task     = require('./models/Task');

const MEMBERS = [
  { name:'Arjun Sharma',  email:'admin@logiclords.com', password:'admin123', role:'Frontend',   skills:['React','TypeScript','Figma','TailwindCSS','Next.js','Jest'],  github:'https://github.com/arjun',   linkedin:'https://linkedin.com/in/arjun', isAdmin:true, bio:'Frontend lead & UI wizard. Obsessed with micro-interactions.' },
  { name:'Priya Nair',    email:'priya@logiclords.com', password:'member123',role:'AI/ML',      skills:['Python','TensorFlow','NLP','PyTorch','scikit-learn','HuggingFace'], github:'https://github.com/priya',   linkedin:'https://linkedin.com/in/priya',  bio:'ML researcher with a soft spot for NLP. 2x Kaggle Expert.' },
  { name:'Rohan Gupta',   email:'rohan@logiclords.com', password:'member123',role:'Backend',    skills:['Node.js','MongoDB','Redis','Docker','PostgreSQL','GraphQL'],     github:'https://github.com/rohan',   linkedin:'https://linkedin.com/in/rohan',  bio:'Backend architect. If it can be cached, it will be cached.' },
  { name:'Sneha Reddy',   email:'sneha@logiclords.com', password:'member123',role:'Designer',   skills:['Figma','Adobe XD','Illustrator','Motion Design','Blender'],      github:'https://github.com/sneha',   linkedin:'https://linkedin.com/in/sneha',  bio:'Design thinker. Turns complex flows into beautiful UX.' },
  { name:'Dev Patel',     email:'dev@logiclords.com',   password:'member123',role:'DevOps',     skills:['AWS','Kubernetes','CI/CD','Terraform','Prometheus','Grafana'],    github:'https://github.com/devpatel', linkedin:'https://linkedin.com/in/dev',    bio:'Infrastructure nerd. Uptime > everything.' },
  { name:'Kavya Singh',   email:'kavya@logiclords.com', password:'member123',role:'Full Stack', skills:['Next.js','GraphQL','PostgreSQL','Rust','WebAssembly','Prisma'],   github:'https://github.com/kavya',   linkedin:'https://linkedin.com/in/kavya',  bio:'Full-stack polyglot. Currently learning Rust to annoy the team.' },
];

async function seed() {
  const reset = process.argv.includes('--reset');

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/logiclords');
  console.log('✅ Connected to MongoDB');

  if (reset) {
    await Promise.all([Member.deleteMany(), Project.deleteMany(), Task.deleteMany()]);
    console.log('🗑  Cleared existing data');
  }

  /* Members */
  const existing = await Member.countDocuments();
  if (existing > 0 && !reset) {
    console.log(`ℹ  ${existing} members already exist — skipping member seed (use --reset to overwrite)`);
  } else {
    const members = await Member.insertMany(MEMBERS);
    console.log(`👤 Seeded ${members.length} members`);

    /* Projects */
    const projects = await Project.insertMany([
      {
        title: 'AI Resume Parser',
        description: 'NLP-powered resume parsing and job matching using spaCy and GPT-4.',
        color: '#00f5d4',
        deadline: new Date('2025-08-01'),
        tags: ['Python','FastAPI','React','OpenAI','MongoDB'],
        members: [members[0]._id, members[1]._id, members[2]._id],
        createdBy: members[0]._id,
        status: 'active',
        problem:  'Job seekers waste hours tailoring resumes manually.',
        solution: 'An NLP-powered platform that auto-parses resumes and matches them to jobs.',
        features: ['Smart entity extraction','ATS scoring','Job matching with explainable AI'],
        futureScope: ['Video interview AI analysis','LinkedIn OAuth'],
        demoUrl: 'https://demo.logiclords.dev',
        repoUrl: 'https://github.com/logiclords/ai-resume',
      },
      {
        title: 'LogicLords Platform',
        description: 'This very platform — team portfolio and project management system.',
        color: '#3b82f6',
        deadline: new Date('2025-07-15'),
        tags: ['React','Node.js','MongoDB','TailwindCSS'],
        members: [members[0]._id, members[3]._id, members[5]._id],
        createdBy: members[0]._id,
        status: 'active',
      },
      {
        title: 'Smart Campus IoT',
        description: 'IoT-powered campus management with real-time tracking and ML analytics.',
        color: '#8b5cf6',
        deadline: new Date('2025-09-30'),
        tags: ['Flutter','Firebase','ML','MQTT','Grafana'],
        members: [members[1]._id, members[2]._id, members[4]._id],
        createdBy: members[0]._id,
        status: 'planning',
      },
    ]);
    console.log(`📁 Seeded ${projects.length} projects`);

    /* Tasks */
    const tasks = await Task.insertMany([
      { title:'Setup NLP pipeline',       description:'spaCy-based entity extraction',      project:projects[0]._id, assignee:members[1]._id, createdBy:members[0]._id, status:'done',       priority:'high'   },
      { title:'Build REST API endpoints', description:'FastAPI upload and parsing endpoints',project:projects[0]._id, assignee:members[2]._id, createdBy:members[0]._id, status:'done',       priority:'high'   },
      { title:'React dashboard UI',       description:'Upload wizard and results view',      project:projects[0]._id, assignee:members[0]._id, createdBy:members[0]._id, status:'inprogress', priority:'medium' },
      { title:'Job matching algorithm',   description:'Cosine similarity matching',          project:projects[0]._id, assignee:members[1]._id, createdBy:members[0]._id, status:'inprogress', priority:'high'   },
      { title:'Deploy to AWS',            description:'EC2 + S3 + CloudFront setup',         project:projects[0]._id, assignee:members[4]._id, createdBy:members[0]._id, status:'todo',       priority:'medium' },
      { title:'Hero section animations',  description:'GSAP landing page animations',        project:projects[1]._id, assignee:members[3]._id, createdBy:members[0]._id, status:'done',       priority:'low'    },
      { title:'Team cards & filters',     description:'Member grid with role filters',       project:projects[1]._id, assignee:members[0]._id, createdBy:members[0]._id, status:'done',       priority:'medium' },
      { title:'Kanban board UI',          description:'Drag-and-drop task management',       project:projects[1]._id, assignee:members[5]._id, createdBy:members[0]._id, status:'inprogress', priority:'high'   },
      { title:'JWT auth system',          description:'Login, signup, role-based access',    project:projects[1]._id, assignee:members[2]._id, createdBy:members[0]._id, status:'todo',       priority:'critical'},
      { title:'IoT sensor integration',   description:'MQTT protocol data ingestion',        project:projects[2]._id, assignee:members[4]._id, createdBy:members[0]._id, status:'todo',       priority:'high'   },
      { title:'ML anomaly detection',     description:'Time-series anomaly model',           project:projects[2]._id, assignee:members[1]._id, createdBy:members[0]._id, status:'todo',       priority:'medium' },
    ]);
    console.log(`✅ Seeded ${tasks.length} tasks`);
  }

  await mongoose.disconnect();
  console.log('\n🎉 Seed complete!');
  console.log('─'.repeat(42));
  console.log('Admin login:  admin@logiclords.com / admin123');
  console.log('Member login: priya@logiclords.com  / member123');
}

seed().catch(err => { console.error(err); process.exit(1); });
