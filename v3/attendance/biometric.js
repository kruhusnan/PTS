
/* ========================================
   PTS SMART SCHOOL V.3 : QUICK ATTENDANCE
   ระบบยืนยันตัวตน Biometric และ SSO
   โรงเรียนบ้านปงตา
   ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา
======================================== */
(function(){
  'use strict';
  /* ส่วนที่ 1 : ตั้งค่าระบบ V.3 */
  const GAS_API_URL='https://script.google.com/macros/s/AKfycbzG3RE33G__LN0tI_GiY26edCrqU1MJ5zcD4_Fx32Mjs9ru4uAsD-m23ibraQDrSA/exec';
  const STORAGE_KEY='PTS_V3_WEBAUTHN_DEVICE';
  const ATTENDANCE_URL='/PTS/v3/attendance/';
  let quickBusy=false;
  let directBusy=false;
  let enrollBusy=false;
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
    if(!Number.isFinite(Number(session.expiresAt))||
       Number(session.expiresAt)<=Date.now()){
      const error=Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
      error.code='SSO_REQUIRED';
      throw error;
    }
    return session;
  }
  /* ส่วนที่ 3 : อ่านทะเบียนอุปกรณ์โดยไม่ต้องมี SSO */
  function getDirectCredential(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(!saved||
         saved.version!==3||
         !saved.name||
         typeof saved.credentialId!=='string'||
         !/^[A-Za-z0-9_-]{1,2048}$/.test(saved.credentialId)){
        return null;
      }
      return saved;
    }catch(e){
      return null;
    }
  }
  /* อ่านทะเบียนอุปกรณ์ที่ตรงกับ SSO Session */
  function getSavedCredential(){
    const session=getSession();
    const saved=getDirectCredential();
    if(!session||!saved||saved.name!==session.teacherName){
      return null;
    }
    return saved;
  }
  /* ตรวจสอบการลงทะเบียนอุปกรณ์ผ่าน SSO */
  function hasRegisteredDevice(){
    const saved=getSavedCredential();
    return Boolean(saved&&saved.name&&saved.credentialId);
  }
  /* ส่วนที่ 4 : ตรวจสอบการรองรับ WebAuthn */
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
      directRegistered:Boolean(getDirectCredential()),
      gpsSupported:Boolean(navigator.geolocation)
    };
  }
  /* เปิดหน้าระบบลงเวลา V.3 */
  function openAttendance(){
    window.location.href=ATTENDANCE_URL;
  }
  /* ส่วนที่ 5 : ติดต่อ Google Apps Script ผ่าน SSO */
  async function post(payload){
    if(!window.PTSSSO){
      throw Error('ไม่พบระบบ SSO V.3');
    }
    requireSession();
    const result=await window.PTSSSO.post(payload);
    if(!result||result.success!==true){
      const error=Error(
        result?.message||'ไม่สามารถดำเนินการได้'
      );
      error.code=result?.code||'';
      throw error;
    }
    return result;
  }
  /* ติดต่อ API สำหรับลงเวลาและลงทะเบียนโดยตรง */
  async function directPost(payload){
    if(![
      'bioBegin',
      'bioFinish',
      'directEnrollBegin',
      'directEnrollFinish'
    ].includes(payload.action)){
      throw Error('ไม่อนุญาตให้ใช้คำสั่งนี้');
    }
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(GAS_API_URL)){
      throw Error('URL ระบบลงเวลา V.3 ไม่ถูกต้อง');
    }
    const response=await fetch(GAS_API_URL,{
      method:'POST',
      redirect:'follow',
      credentials:'omit',
      cache:'no-store',
      referrerPolicy:'no-referrer',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:JSON.stringify(payload)
    });
    if(!response.ok){
      throw Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
    }
    let result;
    try{
      result=await response.json();
    }catch(e){
      throw Error('เซิร์ฟเวอร์ไม่ได้ส่งข้อมูล JSON กรุณาตรวจสอบ Deployment');
    }
    if(!result||result.success!==true){
      const error=Error(
        result?.message||'ไม่สามารถยืนยันตัวตนได้'
      );
      error.code=result?.code||'';
      throw error;
    }
    return result;
  }
  /* ส่วนที่ 6 : แปลงข้อมูล WebAuthn */
  function fromB64(s){
    if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s)){
      throw Error('ข้อมูล Base64URL ไม่ถูกต้อง');
    }
    let b=s.replace(/-/g,'+').replace(/_/g,'/');
    b+='='.repeat((4-b.length%4)%4);
    return Uint8Array.from(atob(b),x=>x.charCodeAt(0));
  }
  /* แปลงข้อมูลเป็น Base64URL */
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
  /* ตรวจสอบรูปแบบ Challenge */
  function validateChallenge(challenge){
    if(typeof challenge!=='string'||
       !/^[A-Za-z0-9_-]{43}$/.test(challenge)){
      throw Error('Challenge ไม่ถูกต้อง');
    }
    return challenge;
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
  /* ส่วนที่ 7 : เรียกหน้าต่างยืนยันตัวตนจากอุปกรณ์ */
  async function scanCredential(challenge,credentialId){
    if(!isSupported()){
      throw Error('กรุณาเปิดผ่าน Chrome หรือ Safari ที่รองรับ WebAuthn');
    }
    validateChallenge(challenge);
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
  /* ยืนยันตัวตนสำหรับระบบที่ต้องมี SSO */
  async function scan(challenge,credentialId){
    requireSession();
    return scanCredential(challenge,credentialId);
  }
  /* ส่วนที่ 8 : ลงทะเบียนอุปกรณ์ด้วย PIN และ SSO */
  async function enroll(name,pin,onStatus){
    if(enrollBusy||directBusy||quickBusy){
      throw Error('กำลังดำเนินการ กรุณารอสักครู่');
    }
    const session=requireSession(name);
    name=session.teacherName;
    if(!isSupported()){
      throw Error('อุปกรณ์ไม่รองรับ WebAuthn');
    }
    if(!/^\d{4}$/.test(String(pin||''))){
      throw Error('กรุณากรอก PIN 4 หลัก');
    }
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    enrollBusy=true;
    try{
      notify('กำลังตรวจสอบ PIN...');
      const result=await post({
        action:'qaEnrollBegin',
        employeeName:name,
        teacherPin:String(pin)
      });
      validateChallenge(result.challenge);
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
      notify('กรุณายืนยันตัวตนอีกครั้ง...');
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
      clearPrepared();
      return saved;
    }finally{
      enrollBusy=false;
    }
  }
  /* ========================================
     ส่วนที่ 8.1 : ลงทะเบียนโดยตรงด้วย PIN
     ไม่ต้องเข้าสู่หน้า Portal
     ไม่สร้าง SSO Session
  ======================================== */
  async function enrollDirect(name,pin,onStatus){
    if(enrollBusy||directBusy||quickBusy){
      throw Error('กำลังดำเนินการ กรุณารอสักครู่');
    }
    name=String(name||'').trim();
    if(!name){
      throw Error('กรุณาระบุชื่อบุคลากร');
    }
    if(!isSupported()||
       typeof navigator.credentials.create!=='function'){
      throw Error('อุปกรณ์ไม่รองรับ WebAuthn');
    }
    if(!/^\d{4}$/.test(String(pin||''))){
      throw Error('กรุณากรอก PIN 4 หลัก');
    }
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    enrollBusy=true;
    try{
      /* ตรวจสอบชื่อและ PIN จากเซิร์ฟเวอร์ */
      notify('กำลังตรวจสอบ PIN...');
      const result=await directPost({
        action:'directEnrollBegin',
        employeeName:name,
        teacherPin:String(pin)
      });
      validateChallenge(result.challenge);
      /* สร้างทะเบียนอุปกรณ์ใหม่ */
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
      /* ยืนยันการครอบครองกุญแจของอุปกรณ์ */
      notify('กรุณายืนยันตัวตนอีกครั้ง...');
      const assertion=await scanCredential(
        result.challenge,
        credentialId
      );
      /* ส่งหลักฐานให้เซิร์ฟเวอร์ตรวจสอบ */
      notify('กำลังบันทึกทะเบียนอุปกรณ์...');
      const saved=await directPost({
        action:'directEnrollFinish',
        employeeName:name,
        challenge:result.challenge,
        credentialId:credentialId,
        publicKey:toB64(publicKey),
        assertion:assertion
      });
      /* ตรวจสอบผลการลงทะเบียน */
      if(saved.name!==name||
         saved.credentialId!==credentialId){
        throw Error('ข้อมูลทะเบียนอุปกรณ์ไม่ตรงกับคำขอ');
      }
      /* บันทึกทะเบียนอุปกรณ์ในโทรศัพท์ */
      localStorage.setItem(STORAGE_KEY,JSON.stringify({
        name:saved.name,
        credentialId:saved.credentialId,
        version:3
      }));
      clearPrepared();
      return saved;
    }finally{
      enrollBusy=false;
    }
  }
  /* ส่วนที่ 9 : ตรวจสอบตำแหน่ง GPS จากอุปกรณ์ */
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
  /* ส่วนที่ 10 : ลงเวลาจริงผ่าน Biometric จากหน้าแรก */
  async function directBiometricAttendance(onStatus){
    if(directBusy||quickBusy||enrollBusy){
      throw Error('กำลังดำเนินการ กรุณารอสักครู่');
    }
    const saved=getDirectCredential();
    if(!saved){
      const error=Error('กรุณาลงทะเบียนอุปกรณ์ V.3 ก่อน');
      error.code='REENROLL';
      throw error;
    }
    if(!isSupported()){
      throw Error('อุปกรณ์ไม่รองรับ Biometric กรุณาเปิดผ่าน Chrome หรือ Safari');
    }
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    directBusy=true;
    try{
      /* ขอ Challenge จากเซิร์ฟเวอร์ */
      notify('กำลังเตรียมการยืนยันตัวตน...');
      const result=await directPost({
        action:'bioBegin',
        credentialId:saved.credentialId
      });
      validateChallenge(result.challenge);
      /* ยืนยันตัวตนด้วยระบบ Biometric */
      notify('กรุณายืนยันตัวตนบนอุปกรณ์...');
      const assertion=await scanCredential(
        result.challenge,
        saved.credentialId
      );
      /* ตรวจสอบ GPS */
      notify('กำลังตรวจสอบ GPS...');
      const location=await getLocation();
      /* ตรวจสอบทะเบียนอุปกรณ์ก่อนส่งข้อมูล */
      const current=getDirectCredential();
      if(!current||
         current.name!==saved.name||
         current.credentialId!==saved.credentialId){
        throw Error('ทะเบียนอุปกรณ์เปลี่ยนแปลง กรุณาเริ่มใหม่');
      }
      /* ส่งหลักฐานและบันทึกข้อมูลจริง */
      notify('กำลังบันทึกข้อมูล...');
      const verified=await directPost({
        action:'bioFinish',
        challenge:result.challenge,
        assertion:assertion,
        latitude:location.latitude,
        longitude:location.longitude
      });
      /* แสดงผลสำเร็จเมื่อเซิร์ฟเวอร์บันทึกแล้วเท่านั้น */
      if(verified.recorded!==true||
         verified.testMode!==false){
        throw Error('ยังไม่ได้รับการยืนยันการบันทึก กรุณาตรวจสอบรายงาน');
      }
      return verified;
    }finally{
      directBusy=false;
    }
  }
  /* ส่วนที่ 11 : เตรียมข้อมูลลงเวลาผ่าน SSO */
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
  /* ตรวจสอบและจัดเตรียมข้อมูลก่อนส่งเซิร์ฟเวอร์ */
  function normalizeData(data){
    if(!data||typeof data!=='object'||Array.isArray(data)){
      throw Error('ข้อมูลไม่ถูกต้อง');
    }
    const session=requireSession(data.employeeName);
    const saved=getSavedCredential();
    if(!saved){
      const error=Error('กรุณาลงทะเบียนอุปกรณ์ก่อน');
      error.code='REENROLL';
      throw error;
    }
    const type=String(data.entryType||'').trim();
    const date=String(data.customDate||localDateString());
    const today=localDateString();
    const leaveType=String(data.leaveType||'').trim();
    const tripSubject=String(data.tripSubject||'').trim();
    const tripLocation=String(data.tripLocation||'').trim();
    /* ตรวจสอบสถานะการปฏิบัติงาน */
    if(!['มาปฏิบัติงาน','ลา','ไปราชการ'].includes(type)){
      throw Error('กรุณาเลือกสถานะการปฏิบัติงาน');
    }
    /* ตรวจสอบวันที่ */
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
      throw Error('รูปแบบวันที่ไม่ถูกต้อง');
    }
    const parsed=new Date(date+'T00:00:00Z');
    if(Number.isNaN(parsed.getTime())||
       parsed.toISOString().slice(0,10)!==date){
      throw Error('วันที่ไม่ถูกต้อง');
    }
    if(date>today){
      throw Error('ไม่สามารถบันทึกวันอนาคต');
    }
    if(type==='มาปฏิบัติงาน'&&date!==today){
      throw Error('กรุณาลงเวลามาปฏิบัติงานในวันที่ปัจจุบัน');
    }
    /* ตรวจสอบประเภทการลา */
    if(type==='ลา'&&
       !['ลากิจ','ลาป่วย','ลาคลอด','ลาไปทำฮัจย์'].includes(leaveType)){
      throw Error('กรุณาเลือกประเภทการลา');
    }
    /* ตรวจสอบรายละเอียดไปราชการ */
    if(type==='ไปราชการ'&&(!tripSubject||!tripLocation)){
      throw Error('กรุณาระบุเรื่องและสถานที่ไปราชการ');
    }
    if(tripSubject.length>500||tripLocation.length>500){
      throw Error('รายละเอียดมีความยาวเกินกำหนด');
    }
    return {
      employeeName:session.teacherName,
      credentialId:saved.credentialId,
      entryType:type,
      customDate:date,
      leaveType:leaveType,
      tripSubject:tripSubject,
      tripLocation:tripLocation
    };
  }
  /* ส่วนที่ 12 : ตรวจสอบความพร้อมก่อนลงเวลา */
  async function prime(){
    if(directBusy||quickBusy||enrollBusy)return null;
    if(!getSession()||!getSavedCredential())return null;
    /* ตรวจสอบความพร้อมโดยไม่สร้าง Challenge ล่วงหน้า */
    return checkReadiness();
  }
  /* ส่วนที่ 13 : บันทึกการปฏิบัติงาน ลา และไปราชการ */
  async function submit(data,onStatus,challenge){
    if(quickBusy||directBusy||enrollBusy){
      throw Error('กำลังดำเนินการ กรุณารอสักครู่');
    }
    if(!isSupported()){
      throw Error('อุปกรณ์ไม่รองรับ Biometric');
    }
    const request=normalizeData(data);
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    quickBusy=true;
    try{
      /* ขอ Challenge ใหม่ให้ตรงกับข้อมูลที่ผู้ใช้เลือก */
      notify('กำลังเตรียมการยืนยันตัวตน...');
      const result=await post({
        action:'qaBegin',
        data:request
      });
      validateChallenge(result.challenge);
      if(result.date!==request.customDate){
        throw Error('วันที่ไม่ตรงกับคำขอ');
      }
      /* ยืนยันตัวตนด้วย Biometric */
      notify('กรุณายืนยันตัวตนบนอุปกรณ์...');
      const assertion=await scan(
        result.challenge,
        request.credentialId
      );
      /* ตรวจสอบ GPS เฉพาะการมาปฏิบัติงาน */
      let location={
        latitude:null,
        longitude:null
      };
      if(request.entryType==='มาปฏิบัติงาน'){
        notify('กำลังตรวจสอบ GPS...');
        location=await getLocation();
      }
      /* ตรวจสอบ Session และทะเบียนอุปกรณ์ซ้ำ */
      requireSession(request.employeeName);
      const saved=getSavedCredential();
      if(!saved||saved.credentialId!==request.credentialId){
        throw Error('ทะเบียนอุปกรณ์เปลี่ยนแปลง กรุณาเริ่มใหม่');
      }
      /* ส่งหลักฐานให้เซิร์ฟเวอร์ตรวจสอบและบันทึก */
      notify('กำลังบันทึกข้อมูล...');
      const verified=await post({
        action:'qaFinish',
        employeeName:request.employeeName,
        challenge:result.challenge,
        assertion:assertion,
        latitude:location.latitude,
        longitude:location.longitude
      });
      /* ตรวจสอบผลการบันทึกจริง */
      if(verified.recorded!==true||
         verified.testMode!==false){
        throw Error('ยังไม่ได้รับการยืนยันการบันทึก กรุณาตรวจสอบรายงาน');
      }
      return verified;
    }finally{
      quickBusy=false;
      clearPrepared();
    }
  }
  /* ส่วนที่ 14 : ฟังก์ชันลงเวลาด่วนจากหน้าแรก */
  async function quickAttendance(onStatus){
    return directBiometricAttendance(onStatus);
  }
  /* ส่วนที่ 15 : รองรับการเรียกจากหน้าเว็บเดิม */
  function clearPrepared(){
    /* ระบบใหม่สร้าง Challenge ทุกครั้งก่อนดำเนินการ */
    return null;
  }
  /* รองรับชื่อฟังก์ชันเดิมโดยไม่บันทึกผ่านคำสั่งทดสอบ */
  async function directBiometricTest(){
    throw Error('กรุณาอัปเดตหน้าเว็บไซต์เป็นเวอร์ชันใช้งานจริง');
  }
  /* ส่วนที่ 16 : เปิดฟังก์ชันให้หน้าเว็บ V.3 เรียกใช้งาน */
  window.PTSBiometric=Object.freeze({
    getDirectCredential,
    getSavedCredential,
    hasRegisteredDevice,
    isSupported,
    localDateString,
    checkReadiness,
    openAttendance,
    prime,
    enroll,
    enrollDirect,
    submit,
    quickAttendance,
    directBiometricAttendance,
    directBiometricTest,
    clearPrepared
  });
})();
/* ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา */
