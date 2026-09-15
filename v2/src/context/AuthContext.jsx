import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {getSupabase} from '../lib/supabase';

const AuthContext=createContext(null);

export function AuthProvider({children}){
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [loading,setLoading]=useState(true);
  const [client,setClient]=useState(null);

  useEffect(()=>{
    let active=true;
    let subscription;
    let requestId=0;

    async function applySession(db,next){
      const current=++requestId;
      if(!active)return;
      setLoading(true);
      setSession(next);
      if(!next){
        setProfile(null);
        setLoading(false);
        return;
      }
      const {data,error}=await db.from('profiles')
        .select('id,full_name,university_id,role,college_id,department_id,is_active')
        .eq('id',next.user.id)
        .maybeSingle();
      if(!active||current!==requestId)return;
      setProfile(!error&&data?.is_active?data:null);
      setLoading(false);
    }

    (async()=>{
      const db=await getSupabase();
      if(!active)return;
      setClient(db);
      if(!db){setLoading(false);return;}
      const {data}=await db.auth.getSession();
      await applySession(db,data.session);
      if(!active)return;
      const result=db.auth.onAuthStateChange((_event,next)=>{
        queueMicrotask(()=>applySession(db,next));
      });
      subscription=result.data.subscription;
    })();

    return()=>{
      active=false;
      requestId++;
      subscription?.unsubscribe();
    };
  },[]);

  const value=useMemo(()=>({
    session,profile,loading,client,
    signOut:()=>client?.auth.signOut()
  }),[session,profile,loading,client]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth=()=>useContext(AuthContext);
