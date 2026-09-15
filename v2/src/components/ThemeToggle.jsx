import {useEffect,useState} from 'react';

export default function ThemeToggle(){
  const [dark,setDark]=useState(()=>{
    const saved=localStorage.getItem('snu-theme');
    return saved?saved==='dark':window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  });
  useEffect(()=>{
    document.documentElement.dataset.theme=dark?'dark':'light';
    localStorage.setItem('snu-theme',dark?'dark':'light');
  },[dark]);
  return <button type="button" className="themeToggle" onClick={()=>setDark(value=>!value)} aria-label={dark?'تشغيل الوضع النهاري':'تشغيل الوضع الداكن'} title={dark?'الوضع النهاري':'الوضع الداكن'}>{dark?'☀':'☾'}</button>;
}
