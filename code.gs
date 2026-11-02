function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('PTS')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ฟังก์ชันดึงรายชื่อบุคลากร
function getTeacherList() {
  var sheetId = '1y5HrRgvYR4O4vs1kePeNRXk-VEJXLrQD45NwsYG_7tY';
  try {
    var ss = SpreadsheetApp.openById(sheetId);
    
    // ลองค้นหา Sheet โดยไม่สนตัวเล็กตัวใหญ่
    var sheets = ss.getSheets();
    var sheet = null;
    for (var s = 0; s < sheets.length; s++) {
      if (sheets[s].getName().trim().toLowerCase() === 'teachers') {
        sheet = sheets[s];
        break;
      }
    }
    
    if (!sheet) {
      Logger.log("ไม่พบแผ่นงาน Teachers");
      return [];
    }
    
    var data = sheet.getDataRange().getValues();
    var teacherList = [];
    
    for (var i = 1; i < data.length; i++) {
      var name = data[i][0] ? data[i][0].toString().trim() : '';
      if (name !== '') {
        teacherList.push(name);
      }
    }
    Logger.log("รายชื่อที่ดึงได้: " + JSON.stringify(teacherList));
    return teacherList;
  } catch (e) {
    Logger.log("Error: " + e.toString());
    return [];
  }
}

// ฟังก์ชันตรวจสอบการ Login
function checkLogin(nameInput, passInput) {
  var sheetId = '1y5HrRgvYR4O4vs1kePeNRXk-VEJXLrQD45NwsYG_7tY'; 
  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheets = ss.getSheets();
    var sheet = null;
    for (var s = 0; s < sheets.length; s++) {
      if (sheets[s].getName().trim().toLowerCase() === 'teachers') {
        sheet = sheets[s];
        break;
      }
    }
    
    if (!sheet) return { success: false, message: 'ไม่พบแผ่นงาน "Teachers" ใน Google Sheet!' };
    
    var data = sheet.getDataRange().getValues();
    
    for (var i = 1; i < data.length; i++) {
      var nameInSheet = data[i][0] ? data[i][0].toString().trim() : '';
      var passInSheet = data[i][1] ? data[i][2].toString().trim() : '';
      
      if (nameInSheet === nameInput.trim() && passInSheet === passInput.toString().trim()) {
        return { success: true, teacherName: nameInSheet };
      }
    }
    return { success: false, message: 'รหัส PIN ไม่ถูกต้อง!' };
  } catch (e) {
    return { success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ Sheet: ' + e.toString() };
  }
}
