
/* ==========================================
   PTS SMART SCHOOL V2 : Biometric + SSO
   โรงเรียนบ้านปงตา
   ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา
========================================== */
(function(){
  'use strict';
  /* ส่วนที่ 1 : กำหนดค่าระบบ */
  const GAS_API_URL='https://script.google.com/macros/s/AKfycbzn2-JdsHmL6hcKnZ2C5DUNxTl-2EqJ4HIV6O9zudE8_ygtX6_bwvu8I-XFRJ4-I74k/exec';
  const STORAGE_KEY='PTS_WEBAUTHN_DEVICE_V1';
  const HOME_URL='/PTS/v2/';
  const PORTAL_URL='/PTS/v2/portal/';
  const ATTENDANCE_URL='/PTS/v2/attendance/';
  let quickBusy=false,prepared=null,pending=null;
  let ssoSession=null,ssoPending=null,ssoBusy=false;
  /* ส่วนที่ 2 : ตรวจสอบทะเบียนอุปกรณ์ */
  function getSavedCredential(){
    try{
      return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    }catch(e){
      return null;
    }
  }
  function hasRegisteredDevice(){
    const s=getSavedCredential();
    return Boolean(s&&s.name&&s.credentialId&&s.version===2);
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
  /* อ่านวันที่ปัจจุบันตามเวลาไทย */
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
  /* ตรวจสอบความพร้อมของอุปกรณ์ */
  function checkReadiness(){
    return {
      supported:isSupported(),
      registered:hasRegisteredDevice(),
      gpsSupported:Boolean(navigator.geolocation)
    };
  }
  /* ส่วนที่ 3 : เปิดหน้าต่างระบบ */
  function openAttendance(){
    window.location.href=ATTENDANCE_URL;
  }
  function openPortal(){
    window.location.href=PORTAL_URL;
  }
  function openHome(){
    window.location.href=HOME_URL;
  }
  /* ส่วนที่ 4 : ติดต่อ Google Apps Script API */
  async function post(payload){
    const res=await fetch(GAS_API_URL,{
      method:'POST',
      redirect:'follow',
      credentials:'omit',
      cache:'no-store',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:JSON.stringify(payload)
    });
    if(!res.ok){
      throw Error('เซิร์ฟเวอร์ไม่ตอบสนอง (HTTP '+res.status+')');
    }
    let data;
    try{
      data=await res.json();
    }catch(e){
      throw Error('ไม่สามารถอ่านผลจากเซิร์ฟเวอร์ กรุณาตรวจสอบการเผยแพร่ Web App');
    }
    if(!data||!data.success){
      const e=Error(
        (data&&data.message)||'เซิร์ฟเวอร์ปฏิเสธคำขอ'
      );
      e.code=(data&&data.code)||'';
      throw e;
    }
    return data;
  }
  /* ==========================================
     ส่วนที่ 5 : รับบัตรผ่าน SSO จาก PTS Portal
  ========================================== */
  function readSsoTicket(){
    const params=new URLSearchParams(
      window.location.hash.slice(1)
    );
    const ticket=params.get('ticket')||'';
    if(!/^[a-f0-9]{64}$/.test(ticket)){
      return '';
    }
    return ticket;
  }
  /* ลบบัตรผ่านออกจาก URL หลังรับข้อมูล */
  function clearSsoTicket(){
    const url=new URL(window.location.href);
    const params=new URLSearchParams(url.hash.slice(1));
    params.delete('ticket');
    url.hash=params.toString();
    history.replaceState(
      null,'',url.pathname+url.search+url.hash
    );
  }
  /* ตรวจสอบว่ามีบัตรผ่าน SSO หรือไม่ */
  function hasSsoTicket(){
    return Boolean(readSsoTicket());
  }
  /* แลกบัตรผ่านใช้ครั้งเดียวเป็น Session */
  async function exchangeSSO(){
    if(ssoPending)return ssoPending;
    if(ssoSession&&Date.now()<ssoSession.expiresAt){
      return getSsoSession();
    }
    const ticket=readSsoTicket();
    if(!ticket){
      throw Error('กรุณาเข้าสู่ระบบผ่าน PTS Portal');
    }
    clearSsoTicket();
    ssoPending=(async function(){
      const result=await post({
        action:'ssoExchange',
        ticket:ticket
      });
      if(
        !/^[a-f0-9]{64}$/.test(result.token||'')||
        !['leave','trip','register','report'].includes(result.purpose)||
        !Number.isFinite(Number(result.expiresAt))||
        Date.now()>=Number(result.expiresAt)
      ){
        throw Error('ข้อมูล Session ไม่ถูกต้องหรือหมดอายุ');
      }
      /* เก็บ Session ในหน่วยความจำเท่านั้น */
      ssoSession={
        token:result.token,
        teacherName:result.teacherName,
        position:result.position||'',
        role:result.role||'USER',
        canRecordOthers:result.canRecordOthers===true,
        purpose:result.purpose,
        expiresAt:Number(result.expiresAt)
      };
      return getSsoSession();
    })();
    try{
      return await ssoPending;
    }finally{
      ssoPending=null;
    }
  }
  /* อ่านข้อมูล Session โดยไม่ส่ง Token ให้หน้าฟอร์ม */
  function getSsoSession(){
    if(!ssoSession)return null;
    if(Date.now()>=ssoSession.expiresAt){
      ssoSession=null;
      return null;
    }
    const {token,...profile}=ssoSession;
    return {...profile};
  }
  /* ตรวจสอบ Session ก่อนเรียก API */
  function requireSSO(purpose){
    const session=getSsoSession();
    if(!session){
      throw Error('Session หมดอายุ กรุณาเข้าจาก PTS Portal ใหม่');
    }
    if(purpose&&session.purpose!==purpose){
      throw Error('ไม่มีสิทธิ์ใช้งานเมนูนี้');
    }
    return {...ssoSession};
  }
  /* โหลดรายชื่อบุคลากรตามสิทธิ์ล่าสุด */
  async function getSsoContext(){
    const session=requireSSO();
    const result=await post({
      action:'ssoContext',
      token:session.token
    });
    if(!ssoSession||ssoSession.token!==session.token){
      throw Error('Session ถูกยกเลิกแล้ว');
    }
    ssoSession.role=result.role||'USER';
    ssoSession.canRecordOthers=result.canRecordOthers===true;
    return result;
  }
  /* ยกเลิก Session ของระบบลงเวลา */
  async function logoutSSO(){
    const session=ssoSession;
    ssoSession=null;
    if(session){
      return post({
        action:'ssoLogout',
        token:session.token
      });
    }
    return {success:true};
  }
  /* ==========================================
     ส่วนที่ 6 : บันทึกลาและไปราชการผ่าน SSO
     ไม่สแกนลายนิ้วมือ ไม่ตรวจสอบ GPS
  ========================================== */
  async function recordViaSSO(data,onStatus){
    if(ssoBusy)throw Error('กำลังดำเนินการ');
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    const type=String(data.entryType||'').trim();
    if(!['ลา','ไปราชการ'].includes(type)){
      throw Error('รองรับเฉพาะการลาและไปราชการ');
    }
    const purpose=type==='ลา'?'leave':'trip';
    const session=requireSSO(purpose);
    const name=String(
      data.employeeName||session.teacherName
    ).trim();
    /* ตรวจสอบสิทธิ์เบื้องต้นก่อนส่งข้อมูล */
    if(!session.canRecordOthers&&name!==session.teacherName){
      throw Error('ไม่มีสิทธิ์บันทึกแทนบุคลากรคนอื่น');
    }
    const customDate=String(data.customDate||localDateString());
    const leaveType=String(data.leaveType||'').trim();
    const tripSubject=String(data.tripSubject||'').trim();
    const tripLocation=String(data.tripLocation||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(customDate)){
      throw Error('กรุณาเลือกวันที่');
    }
    if(customDate>localDateString()){
      throw Error('ไม่สามารถบันทึกวันอนาคต');
    }
    if(
      type==='ลา'&&
      !['ลากิจ','ลาป่วย','ลาคลอด','ลาไปทำฮัจย์'].includes(leaveType)
    ){
      throw Error('กรุณาเลือกประเภทการลา');
    }
    if(type==='ไปราชการ'&&(!tripSubject||!tripLocation)){
      throw Error('กรุณาระบุเรื่องและสถานที่ไปราชการ');
    }
    if(tripSubject.length>500||tripLocation.length>500){
      throw Error('รายละเอียดต้องไม่เกิน 500 ตัวอักษร');
    }
    ssoBusy=true;
    try{
      notify('กำลังบันทึกข้อมูล...');
      return await post({
        action:'ssoRecord',
        token:session.token,
        data:{
          employeeName:name,
          entryType:type,
          customDate:customDate,
          leaveType:leaveType,
          tripSubject:tripSubject,
          tripLocation:tripLocation
        }
      });
    }finally{
      ssoBusy=false;
    }
  }
  /* ==========================================
     ส่วนที่ 7 : แปลงข้อมูล WebAuthn
  ========================================== */
  function fromB64(s){
    let b=s.replace(/-/g,'+').replace(/_/g,'/');
    b+='='.repeat((4-b.length%4)%4);
    return Uint8Array.from(atob(b),x=>x.charCodeAt(0));
  }
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
  /* แปลงหลักฐานการยืนยันตัวตน */
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
  /* เปิดการยืนยันตัวตน Biometric */
  async function scan(challenge,credentialId){
    if(!isSupported()){
      throw Error('กรุณาเปิดผ่าน Chrome หรือ Safari ที่รองรับ WebAuthn');
    }
    const a=await navigator.credentials.get({
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
    return encodeAssertion(a);
  }
  /* ==========================================
     ส่วนที่ 8 : ลงทะเบียน Biometric ผ่าน Portal
     ไม่ต้องกรอก PIN ซ้ำหรือเลือกชื่อบุคลากร
  ========================================== */
  async function enrollViaSSO(onStatus){
    if(ssoBusy)throw Error('กำลังดำเนินการ');
    if(!isSupported()||typeof navigator.credentials.create!=='function'){
      throw Error('อุปกรณ์ไม่รองรับการลงทะเบียน WebAuthn');
    }
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    const session=requireSSO('register');
    ssoBusy=true;
    try{
      notify('กำลังตรวจสอบสิทธิ์จาก PTS Portal...');
      const r=await post({
        action:'qaEnrollBegin',
        token:session.token
      });
      const name=r.teacherName;
      if(!name||name!==session.teacherName){
        throw Error('ข้อมูลผู้ลงทะเบียนไม่ถูกต้อง');
      }
      /* สร้างกุญแจ Biometric บนอุปกรณ์ */
      notify('กรุณายืนยันตัวตนเพื่อลงทะเบียนอุปกรณ์...');
      const cred=await navigator.credentials.create({
        publicKey:{
          challenge:fromB64(r.challenge),
          rp:{
            name:'โรงเรียนบ้านปงตา',
            id:window.location.hostname
          },
          user:{
            id:fromB64(r.userId),
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
      /* ตรวจสอบกุญแจสาธารณะ */
      if(
        !cred||
        !cred.response||
        typeof cred.response.getPublicKey!=='function'
      ){
        throw Error('เบราว์เซอร์ไม่รองรับการอ่านกุญแจสาธารณะ');
      }
      const key=cred.response.getPublicKey();
      if(!key){
        throw Error('ไม่ได้รับกุญแจสาธารณะจากอุปกรณ์');
      }
      const id=toB64(cred.rawId);
      /* ยืนยันการครอบครองกุญแจใหม่ */
      notify('กรุณายืนยันตัวตนอีกครั้งเพื่อรับรองกุญแจใหม่...');
      const assertion=await scan(r.challenge,id);
      requireSSO('register');
      /* ส่งหลักฐานให้ Apps Script ตรวจสอบ */
      notify('กำลังบันทึกทะเบียนอุปกรณ์...');
      const result=await post({
        action:'qaEnrollFinish',
        token:session.token,
        challenge:r.challenge,
        credentialId:id,
        publicKey:toB64(key),
        assertion:assertion
      });
      /* เซิร์ฟเวอร์ยกเลิก Session หลังลงทะเบียนสำเร็จ */
      ssoSession=null;
      prepared=null;
      if(result.name!==name||result.credentialId!==id){
        throw Error('ข้อมูลทะเบียนที่ได้รับไม่ตรงกัน');
      }
      /* เก็บเฉพาะข้อมูลอ้างอิงทะเบียนอุปกรณ์ */
      try{
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            name:result.name,
            credentialId:result.credentialId,
            version:2
          })
        );
      }catch(e){
        throw Error('ลงทะเบียนบนเซิร์ฟเวอร์แล้ว แต่เครื่องไม่สามารถจัดเก็บทะเบียนได้ กรุณาเข้าจาก Portal เพื่อลงทะเบียนใหม่');
      }
      return result;
    }finally{
      ssoBusy=false;
    }
  }
  /* ปิดช่องทางลงทะเบียนด้วย PIN แบบเดิม */
  async function enroll(){
    throw Error('กรุณาลงทะเบียนอุปกรณ์ผ่าน PTS Portal');
  }
  /* ==========================================
     ส่วนที่ 9 : ตรวจสอบ GPS สำหรับมาปฏิบัติงาน
  ========================================== */
  function getLocation(){
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation){
        return reject(Error('อุปกรณ์ไม่รองรับ GPS'));
      }
      navigator.geolocation.getCurrentPosition(
        p=>resolve({
          latitude:p.coords.latitude,
          longitude:p.coords.longitude
        }),
        e=>reject(Error(
          ({
            1:'กรุณาอนุญาตให้เว็บไซต์ใช้ GPS',
            2:'ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS',
            3:'ค้นหาตำแหน่งนานเกินไป'
          })[e.code]||'ไม่สามารถอ่าน GPS ได้'
        )),
        {
          enableHighAccuracy:true,
          timeout:15000,
          maximumAge:0
        }
      );
    });
  }
  /* ==========================================
     ส่วนที่ 10 : เตรียมการลงเวลาด่วน
     สำหรับปุ่มสีขาวหน้าแรก
  ========================================== */
  function quickData(){
    const s=getSavedCredential();
    if(!hasRegisteredDevice()){
      const e=Error('กรุณาลงทะเบียนอุปกรณ์ผ่าน PTS Portal');
      e.code='REENROLL';
      throw e;
    }
    return {
      employeeName:s.name,
      credentialId:s.credentialId,
      entryType:'มาปฏิบัติงาน',
      customDate:localDateString()
    };
  }
  /* สร้างรหัสอ้างอิงคำขอลงเวลา */
  function quickKey(d){
    return JSON.stringify([
      d.employeeName,
      d.credentialId,
      d.entryType,
      d.customDate
    ]);
  }
  /* เตรียม Challenge ล่วงหน้าเพื่อลดเวลารอ */
  async function prime(){
    if(!isSupported()||!hasRegisteredDevice()||quickBusy){
      return;
    }
    const data=quickData();
    const key=quickKey(data);
    if(
      prepared&&
      prepared.key===key&&
      Date.now()-prepared.at<90000
    ){
      return;
    }
    if(pending)return pending;
    pending=post({
      action:'qaBegin',
      data:data
    }).then(r=>{
      const current=getSavedCredential();
      if(
        current&&
        current.name===data.employeeName&&
        current.credentialId===data.credentialId
      ){
        prepared={
          key:key,
          at:Date.now(),
          challenge:r.challenge
        };
      }
    }).catch(()=>{
      prepared=null;
    }).finally(()=>{
      pending=null;
    });
    return pending;
  }
  /* ==========================================
     ส่วนที่ 11 : บันทึกเวลามาปฏิบัติงาน
     ใช้ Biometric + GPS + WebAuthn
  ========================================== */
  async function submit(data,onStatus,challenge){
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    if(data.entryType!=='มาปฏิบัติงาน'){
      throw Error('กรุณาบันทึกการลาหรือไปราชการผ่าน PTS Portal');
    }
    if(!challenge){
      notify('กำลังเตรียมการยืนยันตัวตน...');
      const r=await post({
        action:'qaBegin',
        data:data
      });
      challenge=r.challenge;
    }
    /* ยืนยันตัวตนบนอุปกรณ์ */
    notify('กรุณายืนยันตัวตนบนโทรศัพท์...');
    const assertion=await scan(
      challenge,
      data.credentialId
    );
    /* ตรวจสอบ GPS */
    notify('กำลังตรวจสอบ GPS...');
    const loc=await getLocation();
    /* ส่งข้อมูลให้เซิร์ฟเวอร์ตรวจสอบและบันทึก */
    notify('กำลังบันทึกข้อมูล...');
    return post({
      action:'qaFinish',
      challenge:challenge,
      assertion:assertion,
      latitude:loc.latitude,
      longitude:loc.longitude
    });
  }
  /* ลงเวลาด่วนจากหน้าแรกโดยไม่เปลี่ยนหน้า */
  async function quickAttendance(onStatus){
    if(quickBusy){
      throw Error('กำลังดำเนินการ');
    }
    const data=quickData();
    const key=quickKey(data);
    quickBusy=true;
    try{
      let challenge=null;
      if(
        prepared&&
        prepared.key===key&&
        Date.now()-prepared.at<90000
      ){
        challenge=prepared.challenge;
        prepared=null;
      }
      return await submit(data,onStatus,challenge);
    }finally{
      quickBusy=false;
      prepared=null;
      prime();
    }
  }
  /* ==========================================
     ส่วนที่ 12 : เปิดใช้งานฟังก์ชันร่วมกัน
  ========================================== */
  window.PTSBiometric=Object.freeze({
    GAS_API_URL,
    getSavedCredential,
    hasRegisteredDevice,
    isSupported,
    localDateString,
    checkReadiness,
    openAttendance,
    openPortal,
    openHome,
    hasSsoTicket,
    exchangeSSO,
    getSsoSession,
    getSsoContext,
    logoutSSO,
    recordViaSSO,
    enrollViaSSO,
    enroll,
    prime,
    submit,
    quickAttendance
  });
})();
/* ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา */
