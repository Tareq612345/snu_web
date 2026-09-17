import {useEffect} from 'react';

// UX deterrent only. Authorization must always be enforced by Supabase RLS.
export default function ClientDeterrence({role}){
  useEffect(()=>{
    if(role==='admin')return undefined;
    const stopMenu=event=>event.preventDefault();
    const stopKeys=event=>{
      const key=event.key.toLowerCase();
      if(event.key==='F12'||(event.ctrlKey&&event.shiftKey&&['i','j','c'].includes(key))||(event.ctrlKey&&key==='u')){
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('contextmenu',stopMenu);
    document.addEventListener('keydown',stopKeys,true);
    return()=>{
      document.removeEventListener('contextmenu',stopMenu);
      document.removeEventListener('keydown',stopKeys,true);
    };
  },[role]);
  return null;
}
