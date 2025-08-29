import {
    db, Context, UserModel, Handler, NotFoundError, ForbiddenError, 
    PRIV, Types, moment
} from 'hydrooj';

// 集合定义
const documentsCol = db.collection('document');
const recordCol = db.collection('record');
const plagiarismCol = db.collection('plagiarism_reports');

// 接口定义
interface Contest {
    _id: string;
    title: string;
    docType: number;
    pids: number[];
    beginAt: Date;
    endAt: Date;
    owner: number;
    domainId: string;
}

interface Problem {
    _id: string;
    docId: number;
    title: string;
    docType: number;
    domainId: string;
}

interface Submission {
    _id: string;
    uid: number;
    code: string;
    lang: string;
    pid: number;
    contest: string;
    status: number;
    judgeAt: Date;
    domainId: string;
}

interface PlagiarismReport {
    _id?: string;
    contestId: string;
    problemIds: number[];
    createdAt: Date;
    createdBy: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    results?: PlagiarismResult[];
}

interface PlagiarismResult {
    problemId: number;
    language: string;
    languageName: string;
    submissionCount: number;
    userCount: number;
    pairs: SimilarityPair[];
}

interface SimilarityPair {
    submission1: string;
    submission2: string;
    user1: number;
    user2: number;
    similarity: number;
    details: SimilarityDetail[];
}

interface SimilarityDetail {
    startLine1: number;
    endLine1: number;
    startLine2: number;
    endLine2: number;
    text1: string;
    text2: string;
    similarity: number;
}

declare module 'hydrooj' {
    interface Model {
        plagiarism: typeof plagiarismModel;
    }
    interface Collections {
        plagiarism_reports: PlagiarismReport;
    }
}

// 代码相似度算法
class CodeSimilarityAnalyzer {
    // 简化代码：移除注释、多余空格、统一格式
    static normalizeCode(code: string, lang: string): string {
        let normalized = code;
        
        // 移除单行注释
        if (lang.includes('cc') || lang.includes('cpp') || lang.includes('java')) {
            normalized = normalized.replace(/\/\/.*$/gm, '');
            normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
        } else if (lang.includes('py')) {
            normalized = normalized.replace(/#.*$/gm, '');
        }
        
        // 移除多余空格和空行
        normalized = normalized.replace(/\s+/g, ' ').trim();
        normalized = normalized.replace(/\n\s*\n/g, '\n');
        
        return normalized;
    }
    
    // 计算两个字符串的编辑距离
    static levenshteinDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];
        const m = str1.length;
        const n = str2.length;
        
        for (let i = 0; i <= m; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= n; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,      // deletion
                        matrix[i][j - 1] + 1,      // insertion
                        matrix[i - 1][j - 1] + 1   // substitution
                    );
                }
            }
        }
        
        return matrix[m][n];
    }
    
    // 计算代码相似度
    static calculateSimilarity(code1: string, code2: string, lang: string): number {
        const normalized1 = this.normalizeCode(code1, lang);
        const normalized2 = this.normalizeCode(code2, lang);
        
        if (normalized1.length === 0 && normalized2.length === 0) return 1.0;
        if (normalized1.length === 0 || normalized2.length === 0) return 0.0;
        
        const distance = this.levenshteinDistance(normalized1, normalized2);
        const maxLength = Math.max(normalized1.length, normalized2.length);
        
        return 1 - (distance / maxLength);
    }
    
    // 找到相似的代码段
    static findSimilarSegments(code1: string, code2: string, lang: string, threshold: number = 0.7): SimilarityDetail[] {
        const lines1 = code1.split('\n');
        const lines2 = code2.split('\n');
        const details: SimilarityDetail[] = [];
        
        const windowSize = 5; // 比较窗口大小
        
        for (let i = 0; i <= lines1.length - windowSize; i++) {
            for (let j = 0; j <= lines2.length - windowSize; j++) {
                const segment1 = lines1.slice(i, i + windowSize).join('\n');
                const segment2 = lines2.slice(j, j + windowSize).join('\n');
                
                const similarity = this.calculateSimilarity(segment1, segment2, lang);
                
                if (similarity >= threshold) {
                    details.push({
                        startLine1: i + 1,
                        endLine1: i + windowSize,
                        startLine2: j + 1,
                        endLine2: j + windowSize,
                        text1: segment1,
                        text2: segment2,
                        similarity: similarity
                    });
                }
            }
        }
        
        return details;
    }
}

// 查重数据模型
const plagiarismModel = {
    // 创建查重报告
    async createReport(contestId: string, problemIds: number[], createdBy: number): Promise<string> {
        const report: PlagiarismReport = {
            contestId,
            problemIds,
            createdAt: new Date(),
            createdBy,
            status: 'pending'
        };
        
        const result = await plagiarismCol.insertOne(report);
        
        // 异步处理查重
        this.processReport(result.insertedId).catch(console.error);
        
        return result.insertedId;
    },
    
    // 处理查重报告
    async processReport(reportId: string): Promise<void> {
        try {
            // 更新状态为处理中
            await plagiarismCol.updateOne(
                { _id: reportId },
                { $set: { status: 'processing' } }
            );
            
            const report = await plagiarismCol.findOne({ _id: reportId });
            if (!report) return;
            
            const results: PlagiarismResult[] = [];
            
            // 按题目处理
            for (const problemId of report.problemIds) {
                // 直接查询，让MongoDB自动处理类型转换
                const submissions = await recordCol.find({
                    contest: report.contestId as any,
                    pid: problemId,
                    status: 1, // 只分析AC的提交
                    code: { $exists: true, $ne: '' }
                }).toArray();
                
                // 按语言分组
                const langGroups = this.groupByLanguage(submissions);
                
                for (const [language, langSubmissions] of Object.entries(langGroups)) {
                    if ((langSubmissions as Submission[]).length < 2) continue; // 至少需要2个提交才能查重
                    
                    const pairs: SimilarityPair[] = [];
                    
                    // 两两比较
                    for (let i = 0; i < (langSubmissions as Submission[]).length; i++) {
                        for (let j = i + 1; j < (langSubmissions as Submission[]).length; j++) {
                            const sub1 = (langSubmissions as Submission[])[i];
                            const sub2 = (langSubmissions as Submission[])[j];
                            
                            if (sub1.uid === sub2.uid) continue; // 跳过同一用户的提交
                            
                            const similarity = CodeSimilarityAnalyzer.calculateSimilarity(
                                sub1.code, sub2.code, language
                            );
                            
                            if (similarity > 0.6) { // 相似度阈值
                                const details = CodeSimilarityAnalyzer.findSimilarSegments(
                                    sub1.code, sub2.code, language
                                );
                                
                                pairs.push({
                                    submission1: sub1._id,
                                    submission2: sub2._id,
                                    user1: sub1.uid,
                                    user2: sub2.uid,
                                    similarity,
                                    details
                                });
                            }
                        }
                    }
                    
                    if (pairs.length > 0) {
                        // 获取独特的用户数量
                        const uniqueUsers = new Set<number>();
                        pairs.forEach(pair => {
                            uniqueUsers.add(pair.user1);
                            uniqueUsers.add(pair.user2);
                        });

                        results.push({
                            problemId,
                            language,
                            languageName: this.getLanguageDisplayName(language),
                            submissionCount: (langSubmissions as Submission[]).length,
                            userCount: uniqueUsers.size,
                            pairs: pairs.sort((a, b) => b.similarity - a.similarity)
                        });
                    }
                }
            }
            
            // 更新结果
            await plagiarismCol.updateOne(
                { _id: reportId },
                { 
                    $set: { 
                        status: 'completed',
                        results 
                    } 
                }
            );
            
        } catch (error) {
            console.error('查重处理失败:', error);
            await plagiarismCol.updateOne(
                { _id: reportId },
                { $set: { status: 'failed' } }
            );
        }
    },
    
    // 按语言分组提交
    groupByLanguage(submissions: Submission[]): Record<string, Submission[]> {
        const groups: Record<string, Submission[]> = {};
        
        for (const submission of submissions) {
            let langGroup = 'other';
            const lang = submission.lang;
            
            // 根据HydroOJ实际的语言ID进行分组
            if (lang === 'c') {
                langGroup = 'c';
            } else if (['cc', 'cc.cc98', 'cc.cc98o2', 'cc.cc11', 'cc.cc11o2', 'cc.cc14', 'cc.cc14o2', 'cc.cc17', 'cc.cc17o2', 'cc.cc20', 'cc.cc20o2'].includes(lang)) {
                langGroup = 'cpp';
            } else if (lang === 'java') {
                langGroup = 'java';
            } else if (lang === 'py.py3') {
                langGroup = 'python';
            } else {
                // 对于其他语言，保持原始语言标识
                langGroup = lang;
            }
            
            if (!groups[langGroup]) {
                groups[langGroup] = [];
            }
            groups[langGroup].push(submission);
        }
        
        return groups;
    },

    // 获取语言的显示名称
    getLanguageDisplayName(langId: string): string {
        const langNames: Record<string, string> = {
            'c': 'C',
            'cpp': 'C++',
            'java': 'Java',
            'python': 'Python'
        };
        return langNames[langId] || langId.toUpperCase();
    },
    
    // 获取查重报告
    async getReport(reportId: string): Promise<PlagiarismReport | null> {
        return await plagiarismCol.findOne({ _id: reportId });
    },
    
    // 获取比赛的查重报告列表
    async getContestReports(contestId: string): Promise<PlagiarismReport[]> {
        return await plagiarismCol.find({ contestId }).sort({ createdAt: -1 }).toArray();
    },
    
    // 获取所有查重报告
    async getAllReports(page: number = 1, limit: number = 20): Promise<{
        reports: PlagiarismReport[];
        total: number;
        pageCount: number;
    }> {
        const skip = (page - 1) * limit;
        const total = await plagiarismCol.countDocuments();
        const reports = await plagiarismCol
            .find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        return {
            reports,
            total,
            pageCount: Math.ceil(total / limit)
        };
    },
    
    // 获取比赛信息
    async getContest(contestId: string): Promise<Contest | null> {
        let contest: Contest | null = null;
        
        // 尝试多种查询方式
        try {
            // 方式1: 直接查询
            contest = await documentsCol.findOne({
                _id: contestId as any,
                docType: 30 // 比赛文档类型
            }) as Contest | null;
        } catch (error) {
            // 查询失败，继续尝试其他方式
        }
        
        // 方式2: 如果直接查询失败，尝试字符串匹配
        if (!contest) {
            try {
                const allContests = await documentsCol.find({ docType: 30 }).toArray() as Contest[];
                contest = allContests.find(c => c._id.toString() === contestId.toString()) || null;
            } catch (error) {
                // 查询失败
            }
        }
        
        return contest;
    },
    
    // 获取题目信息
    async getProblems(problemIds: number[]): Promise<Problem[]> {
        return await documentsCol.find({
            docId: { $in: problemIds },
            docType: 10
        }).toArray() as Problem[];
    },
    
    // 获取用户信息
    async getUserInfo(uid: number): Promise<any> {
        return await UserModel.getById('system', uid);
    },

    // 获取提交详情
    async getSubmission(submissionId: string): Promise<Submission | null> {
        return await recordCol.findOne({ _id: submissionId as any }) as Submission | null;
    },
    
    // 获取所有比赛列表
    async getAllContests(): Promise<Contest[]> {
        return await documentsCol.find({
            docType: 30  // 比赛类型
        }).sort({ beginAt: -1 }).toArray() as Contest[];
    }
};

global.Hydro.model.plagiarism = plagiarismModel;

// 查重系统主界面
class PlagiarismMainHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        
        // 获取最近的查重报告
        const { reports } = await plagiarismModel.getAllReports(1, 10);
        
        // 补充比赛信息
        for (const report of reports) {
            const contest = await plagiarismModel.getContest(report.contestId);
            (report as any).contest = contest;
        }
        
        this.response.template = 'plagiarism_main.html';
        this.response.body = {
            reports,
            title: '代码查重系统'
        };
    }
}

// 比赛查重列表界面
class PlagiarismContestListHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        
        const page = +(this.request.query.page || '1');
        const { reports, total, pageCount } = await plagiarismModel.getAllReports(page);
        
        // 获取所有可用的比赛
        const allContests = await plagiarismModel.getAllContests();
        
        // 补充比赛信息并按比赛分组
        const contestMap = new Map();
        
        for (const report of reports) {
            const contest = await plagiarismModel.getContest(report.contestId);
            if (contest) {
                const contestId = contest._id.toString();
                if (!contestMap.has(contestId)) {
                    contestMap.set(contestId, {
                        contest,
                        reports: []
                    });
                }
                contestMap.get(contestId).reports.push(report);
            }
        }
        
        const contests = Array.from(contestMap.values());
        
        this.response.template = 'plagiarism_contest_list.html';
        this.response.body = {
            contests,
            allContests,  // 添加所有比赛列表供下拉选择使用
            total,
            pageCount,
            page,
            title: '比赛查重列表'
        };
    }
    
    async post() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        
        const { action, contestId } = this.request.body;
        
        if (action === 'create_report') {
            if (!contestId) {
                throw new Error('请选择比赛');
            }
            
            const contest = await plagiarismModel.getContest(contestId);
            if (!contest) {
                throw new Error('比赛不存在');
            }
            
            // 跳转到题目选择页面
            this.response.redirect = `/plagiarism/contest/${contestId}/select`;
            return;
        }
        
        throw new Error('未知操作');
    }
}

// 比赛题目选择界面
class PlagiarismContestSelectHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        
        const { contestId } = this.request.params;
        if (!contestId) {
            throw new NotFoundError('比赛ID无效');
        }
        
        const contest = await plagiarismModel.getContest(contestId);
        if (!contest) {
            throw new NotFoundError('比赛不存在');
        }
        
        const problems = await plagiarismModel.getProblems(contest.pids);
        
        this.response.template = 'plagiarism_contest_select.html';
        this.response.body = {
            contest,
            problems,
            title: `选择查重题目 - ${contest.title}`
        };
    }
    
    async post() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        
        const { contestId } = this.request.params;
        const { problemIds } = this.request.body;
        
        if (!contestId) {
            throw new NotFoundError('比赛ID无效');
        }
        
        if (!problemIds || problemIds.length === 0) {
            throw new Error('请选择至少一个题目');
        }
        
        const selectedProblemIds = Array.isArray(problemIds) 
            ? problemIds.map(id => parseInt(id))
            : [parseInt(problemIds)];
        
        try {
            const reportId = await plagiarismModel.createReport(
                contestId,
                selectedProblemIds,
                this.user._id
            );
            
            this.response.redirect = `/plagiarism/contest/${contestId}?success=1&reportId=${reportId}`;
        } catch (error: any) {
            const contest = await plagiarismModel.getContest(contestId);
            const problems = await plagiarismModel.getProblems(contest!.pids);
            
            this.response.template = 'plagiarism_contest_select.html';
            this.response.body = {
                contest,
                problems,
                error: error.message,
                selectedProblemIds,
                title: `选择查重题目 - ${contest!.title}`
            };
        }
    }
}

// 比赛查重总览界面
class PlagiarismContestDetailHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        
        const { contestId } = this.request.params;
        if (!contestId) {
            throw new NotFoundError('比赛ID无效');
        }
        
        const contest = await plagiarismModel.getContest(contestId);
        if (!contest) {
            throw new NotFoundError('比赛不存在');
        }
        
        const reports = await plagiarismModel.getContestReports(contestId);
        
        // 补充题目信息
        for (const report of reports) {
            const problems = await plagiarismModel.getProblems(report.problemIds);
            (report as any).problems = problems;
        }
        
        const { success, reportId } = this.request.query;
        
        this.response.template = 'plagiarism_contest_detail.html';
        this.response.body = {
            contest,
            reports,
            success: success === '1',
            newReportId: reportId,
            title: `查重总览 - ${contest.title}`
        };
    }
}

// 题目查重结果界面
class PlagiarismProblemDetailHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        
        const { contestId, problemId } = this.request.params;
        if (!contestId || !problemId) {
            throw new NotFoundError('参数无效');
        }
        
        const contest = await plagiarismModel.getContest(contestId);
        if (!contest) {
            throw new NotFoundError('比赛不存在');
        }
        
        const problems = await plagiarismModel.getProblems([parseInt(problemId)]);
        if (problems.length === 0) {
            throw new NotFoundError('题目不存在');
        }
        const problem = problems[0];
        
        // 查找包含该题目的查重报告
        const reports = await plagiarismModel.getContestReports(contestId);
        const relevantReports = reports.filter(report => 
            report.problemIds.includes(parseInt(problemId)) && 
            report.status === 'completed'
        );
        
        let results: PlagiarismResult[] = [];
        if (relevantReports.length > 0) {
            // 使用最新的查重报告
            const latestReport = relevantReports[0];
            results = latestReport.results?.filter(result => 
                result.problemId === parseInt(problemId)
            ) || [];
        }
        
        // 补充用户信息
        for (const result of results) {
            for (const pair of result.pairs) {
                const user1 = await plagiarismModel.getUserInfo(pair.user1);
                const user2 = await plagiarismModel.getUserInfo(pair.user2);
                (pair as any).user1Info = user1;
                (pair as any).user2Info = user2;
            }
        }
        
        this.response.template = 'plagiarism_problem_result.html';
        this.response.body = {
            contest,
            problem,
            results,
            title: `查重结果 - ${problem.title}`
        };
    }
}

// 代码对比详情界面
class PlagiarismCodeCompareHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        
        const { contestId, problemId, sub1, sub2 } = this.request.params;
        if (!contestId || !problemId || !sub1 || !sub2) {
            throw new NotFoundError('参数无效');
        }
        
        const contest = await plagiarismModel.getContest(contestId);
        if (!contest) {
            throw new NotFoundError('比赛不存在');
        }
        
        const problems = await plagiarismModel.getProblems([parseInt(problemId)]);
        if (problems.length === 0) {
            throw new NotFoundError('题目不存在');
        }
        const problem = problems[0];
        
        // 获取两个提交的详情
        const submission1 = await plagiarismModel.getSubmission(sub1);
        const submission2 = await plagiarismModel.getSubmission(sub2);
        
        if (!submission1 || !submission2) {
            throw new NotFoundError('提交不存在');
        }
        
        // 获取用户信息
        const user1 = await plagiarismModel.getUserInfo(submission1.uid);
        const user2 = await plagiarismModel.getUserInfo(submission2.uid);
        
        // 计算相似度和详细对比
        const similarity = CodeSimilarityAnalyzer.calculateSimilarity(
            submission1.code, submission2.code, submission1.lang
        );
        
        const details = CodeSimilarityAnalyzer.findSimilarSegments(
            submission1.code, submission2.code, submission1.lang
        );
        
        // 高亮重复部分
        const highlightedCode1 = this.highlightSimilarParts(submission1.code, details, 1);
        const highlightedCode2 = this.highlightSimilarParts(submission2.code, details, 2);
        
        this.response.template = 'plagiarism_code_compare.html';
        this.response.body = {
            contest,
            problem,
            submission1: {
                ...submission1,
                user: user1,
                highlightedCode: highlightedCode1
            },
            submission2: {
                ...submission2,
                user: user2,
                highlightedCode: highlightedCode2
            },
            similarity,
            details,
            title: `代码对比 - ${problem.title}`
        };
    }
    
    private highlightSimilarParts(code: string, details: SimilarityDetail[], submissionIndex: 1 | 2): string {
        const lines = code.split('\n');
        const highlightedLines = [...lines];
        
        // 按行号排序，从后往前处理避免索引偏移
        const sortedDetails = details.sort((a, b) => {
            const startLineA = submissionIndex === 1 ? a.startLine1 : a.startLine2;
            const startLineB = submissionIndex === 1 ? b.startLine1 : b.startLine2;
            return startLineB - startLineA;
        });
        
        sortedDetails.forEach((detail, index) => {
            const startLine = submissionIndex === 1 ? detail.startLine1 : detail.startLine2;
            const endLine = submissionIndex === 1 ? detail.endLine1 : detail.endLine2;
            
            for (let i = startLine - 1; i < endLine && i < highlightedLines.length; i++) {
                highlightedLines[i] = `<span class="plagiarism-highlight-${index % 5}">${highlightedLines[i]}</span>`;
            }
        });
        
        return highlightedLines.join('\n');
    }
}

// 注册路由
export function apply(ctx: Context) {
    ctx.Route('plagiarism_main', '/plagiarism', PlagiarismMainHandler);
    ctx.Route('plagiarism_contest_list', '/plagiarism/contest', PlagiarismContestListHandler);
    ctx.Route('plagiarism_contest_select', '/plagiarism/contest/:contestId/select', PlagiarismContestSelectHandler);
    ctx.Route('plagiarism_contest_detail', '/plagiarism/contest/:contestId', PlagiarismContestDetailHandler);
    ctx.Route('plagiarism_problem_detail', '/plagiarism/contest/:contestId/:problemId', PlagiarismProblemDetailHandler);
    ctx.Route('plagiarism_code_compare', '/plagiarism/contest/:contestId/:problemId/compare/:sub1/:sub2', PlagiarismCodeCompareHandler);
    
    // 创建数据库索引
    plagiarismCol.createIndex({ contestId: 1 });
    plagiarismCol.createIndex({ createdAt: -1 });
    plagiarismCol.createIndex({ status: 1 });
    
    console.log('比赛代码查重插件已加载');
}

export const name = 'contest-plagiarism-detector';
export const version = '1.0.0';
export const description = '比赛代码查重插件';
