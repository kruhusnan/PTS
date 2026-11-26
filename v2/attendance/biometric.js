
/* ========================================
   PTS SMART SCHOOL : BIOMETRIC CORE
   ระบบเชื่อมโยง Biometric โรงเรียนบ้านปงตา
======================================== */
(function(){
  'use strict';
  // ส่วนที่ 1 : การตั้งค่าพื้นฐาน
  const STORAGE_KEY='PTS_WEBAUTHN_DEVICE_V1';
  let busy=false;
  // ส่วนที่ 2 : อ่านข้อมูลอุปกรณ์ที่ลงทะเบียนไว้
  function getSavedCredential(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      return raw?JSON.parse(raw):null;
    }catch(e){
      return null;
    }
  }
  // ส่วนที่ 3 : ตรวจสอบการลงทะเบียนอุปกรณ์
  function hasRegisteredDevice(){
    const saved=getSavedCredential();
    return Boolean(saved&&saved.name&&saved.credentialId);
  }
  // ส่วนที่ 4 : ตรวจสอบการรองรับ WebAuthn
  function isSupported(){
    return Boolean(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials&&typeof navigator.credentials.get==='function');
  }
  // ส่วนที่ 5 : จัดรูปแบบวันที่
  function localDateString(d=new Date()){
    const year=d.getFullYear();
    const month=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return [year,month,day].join('-');
  }
  // ส่วนที่ 6 : แปลง Credential ID สำหรับ WebAuthn
  function base64UrlToBuffer(value){
    let base64=value.replace(/-/g,'+').replace(/_/g,'/');
    while(base64.length%4)base64+='=';
    const binary=atob(base64);
    return Uint8Array.from(binary,c=>c.charCodeAt(0));
  }
  // ส่วนที่ 7 : ตรวจสอบความพร้อมของระบบ
  function checkReadiness(){
    return {
      supported:isSupported(),
      registered:hasRegisteredDevice(),
      gpsSupported:Boolean(navigator.geolocation)
    };
  }
  // ส่วนที่ 8 : เปิดระบบลงเวลาเดิม
  function openAttendance(){
    window.location.href='/PTS/v2/attendance/';
  }
  // ส่วนที่ 9 : ทดสอบการสแกนจากหน้าแรก
  // ทดสอบเฉพาะอุปกรณ์ ไม่บันทึกข้อมูลลงชีต
  async function testBiometric(){
    if(busy)return;
    if(!isSupported()){
      alert('เบราว์เซอร์นี้ไม่รองรับ Biometric');
      return;
    }
    const saved=getSavedCredential();
    if(!saved||!saved.name||!saved.credentialId){
      openAttendance();
      return;
    }
    busy=true;
    try{
      const challenge=crypto.getRandomValues(new Uint8Array(32));
      const assertion=await navigator.credentials.get({
        publicKey:{
          challenge:challenge,
          rpId:window.location.hostname,
          allowCredentials:[{
            type:'public-key',
            id:base64UrlToBuffer(saved.credentialId),
            transports:['internal']
          }],
          userVerification:'required',
          timeout:60000
        }
      });
      if(!assertion)throw Error('ไม่ได้รับผลการยืนยันตัวตน');
      alert('ทดสอบ Biometric สำเร็จ\nยังไม่ได้บันทึกเวลาปฏิบัติงาน');
      return true;
    }catch(err){
      if(err.name==='NotAllowedError'){
        alert('ยกเลิกการสแกน หรือหมดเวลาการยืนยันตัวตน');
      }else{
        alert('ไม่สามารถยืนยันตัวตนได้: '+err.message);
      }
      return false;
    }finally{
      busy=false;
    }
  }
  // ส่วนที่ 10 : เปิดให้หน้าแรกเรียกใช้งาน
  window.PTSBiometric=Object.freeze({
    getSavedCredential,
    hasRegisteredDevice,
    isSupported,
    localDateString,
    checkReadiness,
    openAttendance,
    testBiometric
  });
})();
/* ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา */
