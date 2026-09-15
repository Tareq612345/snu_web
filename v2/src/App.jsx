import {lazy,Suspense} from 'react';
import {BrowserRouter,Route,Routes} from 'react-router-dom';
import {AuthProvider} from './context/AuthContext';
import PortalLayout from './components/PortalLayout';
import {Protected} from './components/RouteGuards';

const lazyNamed=(loader,name)=>lazy(()=>loader().then(module=>({default:module[name]})));
const loadPublic=()=>import('./pages/PublicPages');
const loadPortal=()=>import('./pages/PortalPages');

const Landing=lazyNamed(loadPublic,'Landing');
const Login=lazyNamed(loadPublic,'Login');
const StudentHome=lazyNamed(loadPortal,'StudentHome');
const FacultyHome=lazyNamed(loadPortal,'FacultyHome');
const Courses=lazyNamed(loadPortal,'Courses');
const Materials=lazyNamed(loadPortal,'Materials');
const Announcements=lazyNamed(loadPortal,'Announcements');
const UploadMaterial=lazyNamed(loadPortal,'UploadMaterial');
const Students=lazyNamed(loadPortal,'Students');

const Load=({children})=><Suspense fallback={<div className="fullLoader">جاري التحميل…</div>}>{children}</Suspense>;
const Auth=({children})=><AuthProvider>{children}</AuthProvider>;

export default function App(){
  return <BrowserRouter><Routes>
    <Route path="/" element={<Load><Landing/></Load>}/>
    <Route path="/login" element={<Auth><Load><Login/></Load></Auth>}/>
    <Route path="/student" element={<Auth><Protected role="student"><PortalLayout type="student"/></Protected></Auth>}>
      <Route index element={<Load><StudentHome/></Load>}/>
      <Route path="courses" element={<Load><Courses/></Load>}/>
      <Route path="materials" element={<Load><Materials/></Load>}/>
      <Route path="announcements" element={<Load><Announcements/></Load>}/>
    </Route>
    <Route path="/faculty" element={<Auth><Protected role="faculty"><PortalLayout type="faculty"/></Protected></Auth>}>
      <Route index element={<Load><FacultyHome/></Load>}/>
      <Route path="courses" element={<Load><Courses faculty/></Load>}/>
      <Route path="upload" element={<Load><UploadMaterial/></Load>}/>
      <Route path="students" element={<Load><Students/></Load>}/>
    </Route>
    <Route path="*" element={<Load><Landing/></Load>}/>
  </Routes></BrowserRouter>;
}
