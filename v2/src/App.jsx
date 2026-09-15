import {lazy,Suspense} from 'react';
import {BrowserRouter,Navigate,Route,Routes} from 'react-router-dom';
import {AuthProvider} from './context/AuthContext';
import PortalLayout from './components/PortalLayout';
import {Protected} from './components/RouteGuards';
import {portalAllows,portalScope} from './lib/portal';

const lazyNamed=(loader,name)=>lazy(()=>loader().then(module=>({default:module[name]})));
const loadPublic=()=>import('./pages/PublicPages'),loadPortal=()=>import('./pages/PortalPages');
const Landing=lazyNamed(loadPublic,'Landing'),Login=lazyNamed(loadPublic,'Login');
const StudentHome=lazyNamed(loadPortal,'StudentHome'),FacultyHome=lazyNamed(loadPortal,'FacultyHome'),AdminHome=lazyNamed(loadPortal,'AdminHome');
const Courses=lazyNamed(loadPortal,'Courses'),Materials=lazyNamed(loadPortal,'Materials'),Announcements=lazyNamed(loadPortal,'Announcements'),UploadMaterial=lazyNamed(loadPortal,'UploadMaterial'),Students=lazyNamed(loadPortal,'Students'),Profile=lazyNamed(loadPortal,'Profile'),AdminUsers=lazyNamed(loadPortal,'AdminUsers');
const Load=({children})=><Suspense fallback={<div className="fullLoader">جاري التحميل…</div>}>{children}</Suspense>;
const Auth=({children})=><AuthProvider>{children}</AuthProvider>;

export default function App(){return <BrowserRouter><Routes>
  <Route path="/" element={<Load><Landing/></Load>}/><Route path="/login" element={<Auth><Load><Login/></Load></Auth>}/>
  {portalAllows('student')&&<Route path="/student" element={<Auth><Protected role="student"><PortalLayout type="student"/></Protected></Auth>}><Route index element={<Load><StudentHome/></Load>}/><Route path="courses" element={<Load><Courses/></Load>}/><Route path="materials" element={<Load><Materials/></Load>}/><Route path="announcements" element={<Load><Announcements/></Load>}/><Route path="profile" element={<Load><Profile/></Load>}/></Route>}
  {portalAllows('faculty')&&<Route path="/faculty" element={<Auth><Protected role="faculty"><PortalLayout type="faculty"/></Protected></Auth>}><Route index element={<Load><FacultyHome/></Load>}/><Route path="courses" element={<Load><Courses faculty/></Load>}/><Route path="materials" element={<Load><Materials/></Load>}/><Route path="upload" element={<Load><UploadMaterial/></Load>}/><Route path="students" element={<Load><Students/></Load>}/><Route path="profile" element={<Load><Profile/></Load>}/></Route>}
  {portalAllows('admin')&&<Route path="/admin" element={<Auth><Protected role="admin"><PortalLayout type="admin"/></Protected></Auth>}><Route index element={<Load><AdminHome/></Load>}/><Route path="users" element={<Load><AdminUsers/></Load>}/><Route path="profile" element={<Load><Profile/></Load>}/></Route>}
  <Route path="*" element={portalScope==='all'?<Load><Landing/></Load>:<Navigate to="/login" replace/>}/>
</Routes></BrowserRouter>}
