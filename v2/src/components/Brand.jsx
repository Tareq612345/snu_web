import {useState} from 'react';
export default function Brand({compact=false}){const [failed,setFailed]=useState(false);return <div className="brand">{!failed&&<img src="/snu-logo.png" alt="شعار جامعة السويس الأهلية" onError={()=>setFailed(true)}/>} {failed&&<div className="brandFallback">SNU</div>}<div>{!compact&&<strong>جامعة السويس الأهلية</strong>}<span>البوابة التعليمية</span></div></div>}
