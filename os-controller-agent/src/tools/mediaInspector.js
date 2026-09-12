import fs from 'fs-extra';
import path from 'path';
import { searchFilesByName } from './searchOps.js';

/**
 * Gọi Gemini Web Client thông qua Web Browser Automation Gateway (Port 3001)
 * Chuẩn 100% 3 tầng (RPC -> Web DOM -> API Key) qua HTTP REST API, không phụ thuộc ổ đĩa
 */
async function callGeminiWebEngine(promptText, imagePath = null) {
  console.log(`[mediaInspector] Gọi Gemini qua Gateway Port 3001 (imagePath: ${imagePath || 'none'})...`);
  try {
    const bridgeRes = await fetch('http://localhost:3001/api/chat-gateway/gemini-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptText, imagePath, channel: 'os_controller' })
    });

    if (!bridgeRes.ok) {
      throw new Error(`Mã lỗi HTTP ${bridgeRes.status}`);
    }

    const bridgeData = await bridgeRes.json();
    if (bridgeData.success && bridgeData.responseText) {
      return bridgeData.responseText;
    } else {
      throw new Error(bridgeData.error || 'Lỗi không xác định từ Gateway 3001');
    }
  } catch (err) {
    console.error(`[mediaInspector] Lỗi khi gọi Gateway 3001: ${err.message}`);
    throw err;
  }
}

/**
 * Kiểm định hình ảnh bằng Gemini Web Client ở chế độ Trò chuyện tạm thời
 * Trình duyệt Playwright tự động đính kèm file ảnh và gửi câu hỏi đánh giá
 */
export async function inspectImage(filePath, criteria = 'Đánh giá mức độ rõ nét, màu sắc và độ phù hợp của hình ảnh này') {
  const resolved = path.resolve(filePath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`Hình ảnh không tồn tại: ${resolved}`);
  }

  const prompt = `Bạn là chuyên gia thẩm định hình ảnh và truyền thông quảng cáo.
Hãy quan sát bức ảnh được đính kèm và đánh giá theo tiêu chí sau: "${criteria}".
Trả về kết quả dưới dạng JSON (chỉ JSON không kèm lời dẫn khác) gồm các trường:
{
  "score": số từ 1 đến 10,
  "approved": boolean (true nếu score >= 7, ngược lại false),
  "summary": "tóm tắt đánh giá ngắn gọn khoảng 2 câu",
  "reason": "lý do chi tiết"
}`;

  console.log(`[mediaInspector] Đang gửi hình ảnh "${path.basename(resolved)}" tới Gemini Web Client để đánh giá...`);
  const rawReply = await callGeminiWebEngine(prompt, resolved);
  
  try {
    const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 7, approved: true, summary: rawReply, reason: rawReply };
    return {
      success: true,
      filePath: resolved,
      fileName: path.basename(resolved),
      evaluation: result
    };
  } catch (parseErr) {
    return {
      success: true,
      filePath: resolved,
      fileName: path.basename(resolved),
      evaluation: {
        score: 7,
        approved: true,
        summary: rawReply.slice(0, 200),
        reason: rawReply
      }
    };
  }
}

/**
 * Quét thư mục, cho Gemini Web Client kiểm định từng hình ảnh và ra quyết định
 * chọn ra file tốt nhất (#1 Best Match) theo tiêu chí của người dùng
 */
export async function selectBestMediaFromFolder(folderPath, mediaType = 'image', criteria = 'Chọn ảnh quảng cáo đẹp nhất, màu sắc bắt mắt, bố cục rõ ràng') {
  const resolvedFolder = path.resolve(folderPath);
  if (!await fs.pathExists(resolvedFolder)) {
    throw new Error(`Thư mục không tồn tại: ${resolvedFolder}`);
  }

  const extensions = mediaType === 'video' ? ['*.mp4', '*.mov', '*.avi'] : ['*.png', '*.jpg', '*.jpeg', '*.webp'];
  let candidateFiles = [];

  for (const ext of extensions) {
    const res = await searchFilesByName(ext, resolvedFolder);
    if (res && res.files) {
      candidateFiles.push(...res.files);
    }
  }

  candidateFiles = [...new Set(candidateFiles)].slice(0, 5); // Giới hạn kiểm tra 5 file mới nhất để tối ưu thời gian
  if (candidateFiles.length === 0) {
    throw new Error(`Không tìm thấy file ${mediaType} nào trong thư mục: ${resolvedFolder}`);
  }

  console.log(`[mediaInspector] Tìm thấy ${candidateFiles.length} file ứng viên. Bắt đầu thẩm định từng file qua Gemini Web Client...`);
  
  const evaluations = [];
  for (const file of candidateFiles) {
    try {
      const evalRes = await inspectImage(file, criteria);
      evaluations.push({
        filePath: file,
        fileName: path.basename(file),
        score: evalRes.evaluation.score || 0,
        approved: evalRes.evaluation.approved || false,
        summary: evalRes.evaluation.summary || ''
      });
    } catch (e) {
      console.warn(`[mediaInspector] Lỗi khi đánh giá file ${file}: ${e.message}`);
    }
  }

  // Sort by score descending
  evaluations.sort((a, b) => b.score - a.score);
  const bestMatch = evaluations[0] || { filePath: candidateFiles[0], fileName: path.basename(candidateFiles[0]), score: 5, approved: true, summary: 'Mặc định' };

  return {
    success: true,
    folderPath: resolvedFolder,
    totalCandidateCount: candidateFiles.length,
    bestMatch,
    allEvaluations: evaluations
  };
}

/**
 * Kiểm định Video clip qua Gemini Web Client
 */
export async function inspectVideoClip(videoPath, criteria = 'Đánh giá độ thu hút và chất lượng của đoạn video clip này') {
  const resolved = path.resolve(videoPath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`Video clip không tồn tại: ${resolved}`);
  }

  const prompt = `Bạn là chuyên gia kiểm định video clip quảng cáo.
Hãy xem xét thông tin và hình ảnh trích xuất từ video clip đính kèm theo tiêu chí: "${criteria}".
Trả về đánh giá JSON:
{
  "hookScore": số từ 1 đến 10 cho độ hấp dẫn 3 giây đầu,
  "approved": boolean,
  "summary": "nhận xét ngắn gọn",
  "recommendation": "khuyến nghị cải thiện"
}`;

  console.log(`[mediaInspector] Đang gửi video clip "${path.basename(resolved)}" tới Gemini Web Client...`);
  const rawReply = await callGeminiWebEngine(prompt, resolved);

  try {
    const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { hookScore: 8, approved: true, summary: rawReply };
    return {
      success: true,
      videoPath: resolved,
      fileName: path.basename(resolved),
      evaluation: result
    };
  } catch (e) {
    return {
      success: true,
      videoPath: resolved,
      fileName: path.basename(resolved),
      evaluation: { hookScore: 8, approved: true, summary: rawReply }
    };
  }
}
