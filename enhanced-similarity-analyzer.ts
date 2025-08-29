/**
 * JPlag增强版查重分析器
 * 集成简化版JPlag算法到现有查重系统
 */

import { SimpleJPlag, JPlagResult, JPlagOptions } from './jplag-algorithm';

// 增强的相似度详情
export interface EnhancedSimilarityDetail {
    startLine1: number;
    endLine1: number;
    startLine2: number;
    endLine2: number;
    similarity: number;
    codeFragment1: string;
    codeFragment2: string;
    matchType: 'exact' | 'structural' | 'semantic';
    tokenCount: number;
}

// 增强的查重结果
export interface EnhancedSimilarityResult {
    originalSimilarity: number;    // 原始算法相似度
    jplagSimilarity: number;       // JPlag算法相似度
    combinedSimilarity: number;    // 组合相似度
    details: EnhancedSimilarityDetail[];
    confidence: number;            // 结果置信度
    algorithm: 'original' | 'jplag' | 'hybrid';
}

/**
 * 语言检测器
 * 自动检测代码语言类型
 */
class LanguageDetector {
    static detectLanguage(code: string): string {
        const indicators = {
            cpp: [
                /#include\s*<.*>/,
                /\bstd::/,
                /\b(cout|cin|endl)\b/,
                /\b(int|char|float|double|void)\s+\w+\s*\(/,
                /#define\b/
            ],
            java: [
                /\bpublic\s+class\b/,
                /\bpublic\s+static\s+void\s+main\b/,
                /\bimport\s+java\./,
                /\bSystem\.out\.print/,
                /\b(String|Integer|ArrayList)\b/
            ],
            python: [
                /\bdef\s+\w+\s*\(/,
                /\bimport\s+\w+/,
                /\bfrom\s+\w+\s+import\b/,
                /\bprint\s*\(/,
                /\b(True|False|None)\b/
            ],
            javascript: [
                /\bfunction\s+\w+\s*\(/,
                /\b(var|let|const)\s+\w+/,
                /\bconsole\.log\b/,
                /\b(document|window)\./,
                /\b(async|await)\b/
            ]
        };

        for (const [lang, patterns] of Object.entries(indicators)) {
            const score = patterns.reduce((count, pattern) => {
                return count + (pattern.test(code) ? 1 : 0);
            }, 0);
            
            if (score >= 2) {
                return lang;
            }
        }

        return 'cpp'; // 默认为C++
    }
}

/**
 * JPlag增强版查重分析器
 */
export class EnhancedCodeSimilarityAnalyzer {
    private static jplagInstances = new Map<string, SimpleJPlag>();

    /**
     * 获取或创建JPlag实例
     */
    private static getJPlagInstance(language: string): SimpleJPlag {
        if (!this.jplagInstances.has(language)) {
            const options: Partial<JPlagOptions> = {
                language,
                minimumTokenMatch: 12,     // 使用原始JPlag推荐值
                minimumSimilarity: 0.1,    // 提高阈值，减少误报
                ignoreComments: true,      // 忽略注释
                ignoreCase: false,         // 不忽略大小写
                normalizeWhitespace: true, // 标准化空白
                extractStructuralTokensOnly: true  // 启用结构化token模式
            };
            this.jplagInstances.set(language, new SimpleJPlag(options));
        }
        return this.jplagInstances.get(language)!;
    }

    /**
     * 增强版相似度计算
     * 结合原始算法和JPlag算法
     */
    static calculateEnhancedSimilarity(code1: string, code2: string, language?: string): EnhancedSimilarityResult {
        // 自动检测语言
        const detectedLanguage = language || LanguageDetector.detectLanguage(code1);
        
        // 原始算法计算
        const originalSimilarity = this.originalCalculateSimilarity(code1, code2, detectedLanguage);
        
        // JPlag算法计算
        const jplag = this.getJPlagInstance(detectedLanguage);
        const jplagResult = jplag.compare(code1, code2);
        
        // 获取详细匹配信息
        const detailedMatches = jplag.getDetailedMatches(code1, code2, jplagResult);
        
        // 转换为增强的相似度详情
        const enhancedDetails: EnhancedSimilarityDetail[] = detailedMatches.map(detail => ({
            startLine1: detail.lines1.start,
            endLine1: detail.lines1.end,
            startLine2: detail.lines2.start,
            endLine2: detail.lines2.end,
            similarity: detail.match.similarity,
            codeFragment1: detail.code1Fragment,
            codeFragment2: detail.code2Fragment,
            matchType: this.classifyMatchType(detail.code1Fragment, detail.code2Fragment),
            tokenCount: detail.match.lengthOfFirst
        }));

        // 计算组合相似度
        const combinedSimilarity = this.calculateCombinedSimilarity(
            originalSimilarity, 
            jplagResult.similarity,
            enhancedDetails.length
        );

        // 计算置信度
        const confidence = this.calculateConfidence(
            originalSimilarity,
            jplagResult.similarity,
            jplagResult.matchedTokens,
            jplagResult.totalTokens1,
            jplagResult.totalTokens2
        );

        // 选择最佳算法
        const algorithm = this.selectBestAlgorithm(originalSimilarity, jplagResult.similarity, confidence);

        return {
            originalSimilarity,
            jplagSimilarity: jplagResult.similarity,
            combinedSimilarity,
            details: enhancedDetails,
            confidence,
            algorithm
        };
    }

    /**
     * 原始相似度计算算法（简化版）
     */
    private static originalCalculateSimilarity(code1: string, code2: string, language: string): number {
        // 移除注释和空白
        const clean1 = this.cleanCode(code1);
        const clean2 = this.cleanCode(code2);
        
        if (clean1.length === 0 && clean2.length === 0) return 1.0;
        if (clean1.length === 0 || clean2.length === 0) return 0.0;
        
        // 简单的编辑距离算法
        const distance = this.levenshteinDistance(clean1, clean2);
        const maxLength = Math.max(clean1.length, clean2.length);
        
        return 1 - (distance / maxLength);
    }

    private static cleanCode(code: string): string {
        return code
            .replace(/\/\/.*$/gm, '')        // 移除单行注释
            .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
            .replace(/\s+/g, ' ')            // 标准化空白
            .trim();
    }

    private static levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
        
        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,     // 删除
                    matrix[j - 1][i] + 1,     // 插入
                    matrix[j - 1][i - 1] + indicator // 替换
                );
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * 匹配类型分类
     */
    private static classifyMatchType(fragment1: string, fragment2: string): 'exact' | 'structural' | 'semantic' {
        if (fragment1.trim() === fragment2.trim()) {
            return 'exact';
        }
        
        // 检查结构相似性（去除空白和变量名后）
        const normalized1 = this.normalizeStructure(fragment1);
        const normalized2 = this.normalizeStructure(fragment2);
        
        if (normalized1 === normalized2) {
            return 'structural';
        }
        
        return 'semantic';
    }

    private static normalizeStructure(code: string): string {
        return code
            .replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, 'VAR') // 变量名标准化
            .replace(/\d+/g, 'NUM')                         // 数字标准化
            .replace(/\s+/g, ' ')                          // 空白标准化
            .trim();
    }

    /**
     * 计算组合相似度
     */
    private static calculateCombinedSimilarity(
        originalSim: number, 
        jplagSim: number, 
        matchCount: number
    ): number {
        // 根据匹配数量调整权重
        const jplagWeight = Math.min(0.7, 0.3 + matchCount * 0.1);
        const originalWeight = 1 - jplagWeight;
        
        return originalSim * originalWeight + jplagSim * jplagWeight;
    }

    /**
     * 计算置信度
     */
    private static calculateConfidence(
        originalSim: number,
        jplagSim: number,
        matchedTokens: number,
        totalTokens1: number,
        totalTokens2: number
    ): number {
        // 算法一致性
        const consistency = 1 - Math.abs(originalSim - jplagSim);
        
        // 匹配覆盖率
        const coverage = (2 * matchedTokens) / (totalTokens1 + totalTokens2);
        
        // 代码长度因子
        const lengthFactor = Math.min(1, (totalTokens1 + totalTokens2) / 100);
        
        return (consistency * 0.4 + coverage * 0.4 + lengthFactor * 0.2);
    }

    /**
     * 选择最佳算法
     */
    private static selectBestAlgorithm(
        originalSim: number,
        jplagSim: number,
        confidence: number
    ): 'original' | 'jplag' | 'hybrid' {
        if (confidence > 0.8) {
            return 'hybrid';
        }
        
        if (Math.abs(originalSim - jplagSim) < 0.1) {
            return 'hybrid';
        }
        
        // 选择相似度更高的算法
        return jplagSim > originalSim ? 'jplag' : 'original';
    }

    /**
     * 寻找相似代码段（与现有接口兼容）
     */
    static findSimilarSegments(code1: string, code2: string, language: string, threshold: number = 0.4): any[] {
        const result = this.calculateEnhancedSimilarity(code1, code2, language);
        
        return result.details
            .filter(detail => detail.similarity >= threshold)
            .map(detail => ({
                startLine1: detail.startLine1,
                endLine1: detail.endLine1,
                startLine2: detail.startLine2,
                endLine2: detail.endLine2,
                similarity: detail.similarity,
                type: detail.matchType,
                tokenCount: detail.tokenCount
            }));
    }

    /**
     * 与原有系统兼容的相似度计算接口
     */
    static calculateSimilarity(code1: string, code2: string, language: string): number {
        const result = this.calculateEnhancedSimilarity(code1, code2, language);
        
        // 根据算法选择返回最合适的相似度
        switch (result.algorithm) {
            case 'jplag':
                return result.jplagSimilarity;
            case 'original':
                return result.originalSimilarity;
            case 'hybrid':
            default:
                return result.combinedSimilarity;
        }
    }

    /**
     * 获取算法详细信息（用于调试和分析）
     */
    static getDetailedAnalysis(code1: string, code2: string, language?: string): {
        result: EnhancedSimilarityResult;
        jplagDetails: JPlagResult;
        recommendations: string[];
    } {
        const detectedLanguage = language || LanguageDetector.detectLanguage(code1);
        const jplag = this.getJPlagInstance(detectedLanguage);
        const jplagDetails = jplag.compare(code1, code2);
        const result = this.calculateEnhancedSimilarity(code1, code2, detectedLanguage);
        
        const recommendations: string[] = [];
        
        if (result.confidence < 0.5) {
            recommendations.push('低置信度结果，建议手动审核');
        }
        
        if (result.jplagSimilarity > 0.8 && result.originalSimilarity < 0.5) {
            recommendations.push('JPlag检测到高度结构相似性，可能存在代码重构');
        }
        
        if (result.details.length > 10) {
            recommendations.push('检测到多个相似段落，建议详细分析');
        }
        
        if (result.details.some(d => d.matchType === 'exact' && d.tokenCount > 20)) {
            recommendations.push('检测到长段完全相同代码，高度可疑');
        }

        return {
            result,
            jplagDetails,
            recommendations
        };
    }
}
