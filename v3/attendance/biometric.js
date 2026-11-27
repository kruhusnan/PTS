
/* ========================================
   PTS SMART SCHOOL V.3 : QUICK ATTENDANCE
   ระบบยืนยันตัวตน Biometric ผ่าน SSO
   โรงเรียนบ้านปงตา
======================================== */
(function(){
  'use strict';
  /* ส่วนที่ 1 : ตั้งค่าระบบ V.3 */
  const STORAGE_KEY='PTS_V3_WEBAUTHN_DEVICE';
  const ATTENDANCE_URL='/PTS/v3/attendance/';
  let quickBusy=false,prepared=null,pending=null;
  /* ส่วนที่ 2 : อ่าน SSO Session ปัจจุบัน */
  function getSession(){
    return window.PTSSSO?.getSession()||null;
  }
  /* ตรวจสอบสิทธิ์และชื่อบุคลากร */
  function requireSession(name){
    const session=getSession();
    if(!session){
      const error=Error('กรุณาเข้าสู่ระบบผ่าน PTS Portal V.3');
      error.code='SSO_REQUIRED';
      throw error;
    }
    if(name&&name!==session.teacherName){
      throw Error('ไม่อนุญาตให้ใช้สิทธิ์ของบุคลากรคนอื่น');
    }
    return session;
  }
  /* อ่านข้อมูลอุปกรณ์ที่ลงทะเบียนไว้ */
  function getSavedCredential(){
    try{
      const session=getSession();
      if(!session)return null;
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(!saved||saved.version!==3||saved.name!==session.teacherName||!saved.credentialId){
        return null;
      }
      return saved;
    }catch(e){
      return null;
    }
  }
  /* ตรวจสอบการลงทะเบียนอุปกรณ์ */
  function hasRegisteredDevice(){
    const saved=getSavedCredential();
    return Boolean(saved&&saved.name&&saved.credentialId);
  }
  /* ตรวจสอบการรองรับ WebAuthn */
  function isSupported(){
    return Boolean(
      window.isSecureContext&&
      window.PublicKeyCredential&&
      navigator.credentials&&
      typeof navigator.credentials.get==='function'
    );
  }
  /* จัดรูปแบบวันที่ตามเวลาประเทศไทย */
  function localDateString(){
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Bangkok',
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).formatToParts(new Date());
    return ['year','month','day']
      .map(k=>parts.find(p=>p.type===k).value)
      .join('-');
  }
  /* ตรวจสอบความพร้อมของระบบ */
  function checkReadiness(){
    const session=getSession();
    return {
      authenticated:Boolean(session),
      teacherName:session?session.teacherName:'',
      supported:isSupported(),
      registered:hasRegisteredDevice(),
      gpsSupported:Boolean(navigator.geolocation)
    };
  }
  /* เปิดหน้าระบบลงเวลา V.3 */
  function openAttendance(){
    window.location.href=ATTENDANCE_URL;
  }
  /* ส่วนที่ 3 : ติดต่อ Google Apps Script ผ่าน SSO */
  async function post(payload){
    if(!window.PTSSSO){
      throw Error('ไม่พบระบบ SSO V.3');
    }
    requireSession();
    return window.PTSSSO.post(payload);
  }
  /* แปลง Base64URL เป็นข้อมูลสำหรับ WebAuthn */
  function fromB64(s){
    let b=s.replace(/-/g,'+').replace(/_/g,'/');
    b+='='.repeat((4-b.length%4)%4);
    return Uint8Array.from(atob(b),x=>x.charCodeAt(0));
  }
  /* แปลงข้อมูล WebAuthn เป็น Base64URL */
  function toB64(b){
    let s='';
    for(const x of new Uint8Array(b)){
      s+=String.fromCharCode(x);
    }
    return btoa(s)
      .replace(/\+/g,'-')
      .replace(/\//g,'_')
      .replace(/=+$/,'');
  }
  /* จัดเตรียมหลักฐานยืนยันตัวตน */
  function encodeAssertion(a){
    if(!a||!a.response){
      throw Error('ไม่ได้รับผลยืนยันตัวตน');
    }
    return {
      id:toB64(a.rawId),
      clientDataJSON:toB64(a.response.clientDataJSON),
      authenticatorData:toB64(a.response.authenticatorData),
      signature:toB64(a.response.signature)
    };
  }
  /* เรียกหน้าต่างยืนยันตัวตนจากอุปกรณ์ */
  async function scan(challenge,credentialId){
    requireSession();
    if(!isSupported()){
      throw Error('กรุณาเปิดผ่าน Chrome หรือ Safari ที่รองรับ WebAuthn');
    }
    const assertion=await navigator.credentials.get({
      publicKey:{
        challenge:fromB64(challenge),
        rpId:window.location.hostname,
        allowCredentials:[{
          type:'public-key',
          id:fromB64(credentialId),
          transports:['internal']
        }],
        userVerification:'required',
        timeout:60000
      }
    });
    return encodeAssertion(assertion);
  }
  /* ส่วนที่ 4 : ลงทะเบียนอุปกรณ์ด้วย PIN และ SSO */
  async function enroll(name,pin,onStatus){
    const session=requireSession(name);
    name=session.teacherName;
    if(!isSupported()){
      throw Error('อุปกรณ์ไม่รองรับ WebAuthn');
    }
    if(!/^\d{4}$/.test(String(pin||''))){
      throw Error('กรุณากรอก PIN 4 หลัก');
    }
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    notify('กำลังตรวจสอบ PIN...');
    const result=await post({
      action:'qaEnrollBegin',
      employeeName:name,
      teacherPin:String(pin)
    });
    notify('ยืนยันตัวตนเพื่อลงทะเบียนอุปกรณ์...');
    const credential=await navigator.credentials.create({
      publicKey:{
        challenge:fromB64(result.challenge),
        rp:{
          name:'โรงเรียนบ้านปงตา',
          id:window.location.hostname
        },
        user:{
          id:fromB64(result.userId),
          name:name,
          displayName:name
        },
        pubKeyCredParams:[
          {type:'public-key',alg:-7}
        ],
        authenticatorSelection:{
          authenticatorAttachment:'platform',
          userVerification:'required',
          residentKey:'preferred'
        },
        attestation:'none',
        timeout:60000
      }
    });
    if(!credential||
       !credential.response||
       typeof credential.response.getPublicKey!=='function'){
      throw Error('เบราว์เซอร์ไม่รองรับการอ่านกุญแจสาธารณะ');
    }
    const publicKey=credential.response.getPublicKey();
    if(!publicKey){
      throw Error('ไม่ได้รับกุญแจสาธารณะจากอุปกรณ์');
    }
    const credentialId=toB64(credential.rawId);
    notify('กรุณายืนยันตัวตนอีกครั้งเพื่อรับรองกุญแจใหม่...');
    const assertion=await scan(result.challenge,credentialId);
    requireSession(name);
    notify('กำลังบันทึกทะเบียนอุปกรณ์...');
    const saved=await post({
      action:'qaEnrollFinish',
      employeeName:name,
      challenge:result.challenge,
      credentialId:credentialId,
      publicKey:toB64(publicKey),
      assertion:assertion
    });
    if(saved.name!==name||saved.credentialId!==credentialId){
      throw Error('ข้อมูลทะเบียนอุปกรณ์ไม่ตรงกับคำขอ');
    }
    /* จัดเก็บทะเบียนอุปกรณ์เฉพาะ V.3 */
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      name:saved.name,
      credentialId:saved.credentialId,
      version:3
    }));
    prepared=null;
    return saved;
  }
  /* ส่วนที่ 5 : ตรวจสอบตำแหน่ง GPS จริงจากอุปกรณ์ */
  function getLocation(){
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation){
        return reject(Error('อุปกรณ์ไม่รองรับ GPS'));
      }
      navigator.geolocation.getCurrentPosition(
        position=>resolve({
          latitude:position.coords.latitude,
          longitude:position.coords.longitude
        }),
        error=>reject(Error(({
          1:'กรุณาอนุญาตให้เว็บไซต์ใช้ GPS',
          2:'ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS',
          3:'ค้นหาตำแหน่งนานเกินไป'
        })[error.code]||'ไม่สามารถอ่าน GPS ได้')),
        {
          enableHighAccuracy:true,
          timeout:15000,
          maximumAge:0
        }
      );
    });
  }
  /* ส่วนที่ 6 : เตรียมข้อมูลลงเวลาด่วน */
  function quickData(){
    const session=requireSession();
    const saved=getSavedCredential();
    if(!saved||!saved.credentialId){
      const error=Error('กรุณาลงทะเบียนอุปกรณ์ก่อน');
      error.code='REENROLL';
      throw error;
    }
    return {
      employeeName:session.teacherName,
      credentialId:saved.credentialId,
      entryType:'มาปฏิบัติงาน',
      customDate:localDateString()
    };
  }
  /* สร้างกุญแจตรวจสอบคำขอลงเวลา */
  function quickKey(data){
    const session=requireSession(data.employeeName);
    return JSON.stringify([
      session.teacherName,
      session.expiresAt,
      data.credentialId,
      data.entryType,
      data.customDate
    ]);
  }
  /* เตรียม Challenge ล่วงหน้าเพื่อลดเวลารอ */
  async function prime(){
    if(!getSession()||
       !isSupported()||
       !hasRegisteredDevice()||
       quickBusy)return;
    const data=quickData();
    const key=quickKey(data);
    if(prepared&&
       prepared.key===key&&
       Date.now()-prepared.at<90000)return;
    if(pending)return pending;
    pending=post({
      action:'qaBegin',
      data:data
    }).then(result=>{
      const session=getSession();
      if(!session||session.teacherName!==data.employeeName){
        prepared=null;
        return;
      }
      prepared={
        key:key,
        at:Date.now(),
        challenge:result.challenge
      };
    }).catch(()=>{
      prepared=null;
    }).finally(()=>{
      pending=null;
    });
    return pending;
  }
  /* ส่วนที่ 7 : ยืนยันตัวตนและตรวจสอบ GPS */
  async function submit(data,onStatus,challenge){
    const session=requireSession(data.employeeName);
    const saved=getSavedCredential();
    if(!saved||saved.credentialId!==data.credentialId){
      const error=Error('กรุณาลงทะเบียนอุปกรณ์ก่อน');
      error.code='REENROLL';
      throw error;
    }
    data={
      ...data,
      employeeName:session.teacherName
    };
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    if(!challenge){
      notify('กำลังเตรียมการยืนยันตัวตน...');
      const result=await post({
        action:'qaBegin',
        data:data
      });
      challenge=result.challenge;
    }
    notify('กรุณายืนยันตัวตนบนโทรศัพท์...');
    const assertion=await scan(challenge,data.credentialId);
    let location={
      latitude:null,
      longitude:null
    };
    if(data.entryType==='มาปฏิบัติงาน'){
      notify('กำลังตรวจสอบ GPS...');
      location=await getLocation();
    }
    requireSession(data.employeeName);
    /* ส่งหลักฐานยืนยันตัวตนให้เซิร์ฟเวอร์ตรวจสอบ */
    notify('กำลังบันทึกข้อมูล...');
    return post({
      action:'qaFinish',
      employeeName:data.employeeName,
      challenge:challenge,
      assertion:assertion,
      latitude:location.latitude,
      longitude:location.longitude
    });
  }
  /* ส่วนที่ 8 : ฟังก์ชันลงเวลาด่วนจากหน้าแรก */
  async function quickAttendance(onStatus){
    if(quickBusy){
      throw Error('กำลังดำเนินการ');
    }
    const data=quickData();
    const key=quickKey(data);
    quickBusy=true;
    try{
      let challenge=null;
      if(prepared&&
         prepared.key===key&&
         Date.now()-prepared.at<90000){
        challenge=prepared.challenge;
        prepared=null;
      }
      return await submit(data,onStatus,challenge);
    }finally{
      quickBusy=false;
      prepared=null;
      if(getSession()){
        prime().catch(()=>{});
      }
    }
  }
  /* ส่วนที่ 9 : ล้าง Challenge ที่เตรียมไว้ */
  function clearPrepared(){
    prepared=null;
  }
  /* ส่วนที่ 10 : เปิดฟังก์ชันให้หน้าเว็บ V.3 เรียกใช้งาน */
  window.PTSBiometric=Object.freeze({
    getSavedCredential,
    hasRegisteredDevice,
    isSupported,
    localDateString,
    checkReadiness,
    openAttendance,
    prime,
    enroll,
    submit,
    quickAttendance,
    clearPrepared
  });
})();
/* ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา */
