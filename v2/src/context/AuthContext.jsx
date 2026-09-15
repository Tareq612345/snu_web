import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {getSupabase} from '../lib/supabase';

const AuthContext=createContext(null);
const profileFields='id,full_name,university_id,role,college_id,department_id,is_active,phone,location,avatar_path';

export function AuthProvider({children}){
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[client,setClient]=useState(null);
  const fetchProfile=useCallback(async(db,userId)=>{
    const {data,error}=await db.from('profiles').select(profileFields).eq('id',userId).maybeSingle();
    return !error&&data?.is_active?data:null;
  },[]);
  const refreshProfile=useCallback(async()=>{
    if(!client||!session)return null;
    const next=await fetchProfile(client,session.user.id);setProfile(next);return next;
  },[client,session,fetchProfile]);

  useEffect(()=>{
    let active=true,subscription,requestId=0;
    async function applySession(db,next){
      const current=++requestId;if(!active)return;setLoading(true);setSession(next);
      if(!next){setProfile(null);setLoading(false);return;}
      const value=await fetchProfile(db,next.user.id);
      if(!active||current!==requestId)return;setProfile(value);setLoading(false);
    }
    (async()=>{const db=await getSupabase();if(!active)return;setClient(db);if(!db){setLoading(false);return;}const {data}=await db.auth.getSession();await applySession(db,data.session);if(!active)return;subscription=db.auth.onAuthStateChange((_event,next)=>queueMicrotask(()=>applySession(db,next))).data.subscription;})();
    return()=>{active=false;requestId++;subscription?.unsubscribe();};
  },[fetchProfile]);

  const value=useMemo(()=>({session,profile,loading,client,refreshProfile,signOut:()=>client?.auth.signOut()}),[session,profile,loading,client,refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
