/**
 * JPlag专用查重分析器
 * 完全基于JPlag算法进行代码相似性检测，对标原始JPlag实现
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

// JPlag专用查重结果
export interface EnhancedSimilarityResult {
    similarity: number;            // JPlag算法相似度
    details: EnhancedSimilarityDetail[];
    confidence: number;            // 结果置信度
    algorithm: 'jplag';            // 固定使用JPlag算法
    totalTokens1: number;          // 第一个提交的token总数
    totalTokens2: number;          // 第二个提交的token总数
    matchedTokens: number;         // 匹配的token数量
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
                /#define\b/,
                /\busing\s+namespace\b/
            ],
            java: [
                /\bpublic\s+class\b/,
                /\bpublic\s+static\s+void\s+main\b/,
                /\bimport\s+java\./,
                /\bSystem\.out\.print/,
                /\b(String|Integer|ArrayList)\b/
            ],
            python: [
                /^\s*def\s+\w+\s*\(/m,
                /^\s*import\s+\w+/m,
                /^\s*from\s+\w+\s+import/m,
                /\bprint\s*\(/,
                /:\s*$/m
            ]
        };

        let maxScore = 0;
        let detectedLanguage = 'cpp'; // 默认C++

        for (const [lang, patterns] of Object.entries(indicators)) {
            const score = patterns.reduce((acc, pattern) => {
                return acc + (pattern.test(code) ? 1 : 0);
            }, 0);

            if (score > maxScore) {
                maxScore = score;
                detectedLanguage = lang;
            }
        }

        return detectedLanguage;
    }
}

/**
 * JPlag专用查重分析器
 * 完全基于JPlag算法进行代码相似性检测
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
                minimumSimilarity: 0.0,    // 设置为0，让调用方决定阈值
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
     * JPlag相似度计算
     * 完全基于JPlag算法
     */
    static calculateEnhancedSimilarity(code1: string, code2: string, language?: string): EnhancedSimilarityResult {
        // 自动检测语言
        const detectedLanguage = language || LanguageDetector.detectLanguage(code1);
        
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

        // 计算置信度（基于匹配token的数量和质量）
        const confidence = this.calculateJPlagConfidence(
            jplagResult.similarity,
            jplagResult.matchedTokens,
            jplagResult.totalTokens1,
            jplagResult.totalTokens2,
            enhancedDetails.length
        );

        return {
            similarity: jplagResult.similarity,
            details: enhancedDetails,
            confidence,
            algorithm: 'jplag',
            totalTokens1: jplagResult.totalTokens1,
            totalTokens2: jplagResult.totalTokens2,
            matchedTokens: jplagResult.matchedTokens
        };
    }

    /**
     * 计算JPlag置信度
     */
    private static calculateJPlagConfidence(
        similarity: number,
        matchedTokens: number,
        totalTokens1: number,
        totalTokens2: number,
        matchCount: number
    ): number {
        // 基础置信度来自相似度
        let confidence = similarity;
        
        // 根据匹配token数量调整
        const minTokens = Math.min(totalTokens1, totalTokens2);
        if (minTokens > 0) {
            const tokenRatio = matchedTokens / minTokens;
            confidence = confidence * 0.7 + tokenRatio * 0.3;
        }
        
        // 根据匹配段落数量调整（更多匹配段落表示更可靠）
        if (matchCount > 0) {
            const matchBonus = Math.min(matchCount / 5, 0.2); // 最多增加20%
            confidence = Math.min(confidence + matchBonus, 1.0);
        }
        
        // 对于极小的文件，降低置信度
        if (totalTokens1 < 20 || totalTokens2 < 20) {
            confidence *= 0.7;
        }
        
        return Math.max(0, Math.min(1, confidence));
    }

    /**
     * 分类匹配类型
     */
    private static classifyMatchType(fragment1: string, fragment2: string): 'exact' | 'structural' | 'semantic' {
        // 去除空白和注释后比较
        const clean1 = fragment1.replace(/\s+/g, ' ').trim();
        const clean2 = fragment2.replace(/\s+/g, ' ').trim();
        
        if (clean1 === clean2) {
            return 'exact';
        }
        
        // 检查是否只是变量名不同
        const normalized1 = this.normalizeIdentifiers(clean1);
        const normalized2 = this.normalizeIdentifiers(clean2);
        
        if (normalized1 === normalized2) {
            return 'structural';
        }
        
        return 'semantic';
    }

    /**
     * 标准化标识符（替换为占位符）
     */
    private static normalizeIdentifiers(code: string): string {
        // 简化版：替换标识符为占位符
        return code.replace(/\b[a-zA-Z_]\w*\b/g, 'ID');
    }

    /**
     * 直接获取相似度分数（向后兼容）
     */
    static getSimilarityScore(result: EnhancedSimilarityResult): number {
        return result.similarity;
    }

    /**
     * 检查是否为高相似度
     */
    static isHighSimilarity(result: EnhancedSimilarityResult, threshold: number = 0.7): boolean {
        return result.similarity > threshold && result.confidence > 0.6;
    }

    /**
     * 检查是否存在可疑的相似性模式
     */
    static checkSuspiciousPatterns(result: EnhancedSimilarityResult): boolean {
        // 高相似度且高置信度
        if (result.similarity > 0.8 && result.confidence > 0.8) {
            return true;
        }
        
        // 多个小段落匹配，可能表示拼接抄袭
        const smallMatches = result.details.filter(d => d.tokenCount < 20);
        if (smallMatches.length > 5) {
            return true;
        }
        
        // 结构性匹配占主导，可能表示重构
        const structuralMatches = result.details.filter(d => d.matchType === 'structural').length;
        if (structuralMatches > result.details.length * 0.7 && result.similarity > 0.6) {
            return true;
        }
        
        return false;
    }

    /**
     * 生成相似度报告摘要
     */
    static generateSummary(result: EnhancedSimilarityResult): string {
        const similarityPercent = (result.similarity * 100).toFixed(1);
        const confidencePercent = (result.confidence * 100).toFixed(1);
        const tokenRatio = result.totalTokens1 > 0 ? 
            (result.matchedTokens / result.totalTokens1 * 100).toFixed(1) : '0';
        
        let summary = `JPlag相似度: ${similarityPercent}% (置信度: ${confidencePercent}%)\n`;
        summary += `匹配token: ${result.matchedTokens}/${result.totalTokens1} (${tokenRatio}%)\n`;
        summary += `匹配段落: ${result.details.length}个`;
        
        if (result.details.length > 0) {
            const exactMatches = result.details.filter(d => d.matchType === 'exact').length;
            const structuralMatches = result.details.filter(d => d.matchType === 'structural').length;
            const semanticMatches = result.details.filter(d => d.matchType === 'semantic').length;
            
            summary += `\n  - 完全匹配: ${exactMatches}个`;
            summary += `\n  - 结构匹配: ${structuralMatches}个`;
            summary += `\n  - 语义匹配: ${semanticMatches}个`;
        }
        
        return summary;
    }

    /**
     * 获取匹配质量评级
     */
    static getMatchQuality(result: EnhancedSimilarityResult): 'low' | 'medium' | 'high' | 'very_high' {
        if (result.similarity < 0.3) return 'low';
        if (result.similarity < 0.6) return 'medium';
        if (result.similarity < 0.8) return 'high';
        return 'very_high';
    }

    /**
     * 获取详细的分析报告
     */
    static getDetailedReport(result: EnhancedSimilarityResult): {
        summary: string;
        quality: string;
        isSuspicious: boolean;
        recommendations: string[];
    } {
        const quality = this.getMatchQuality(result);
        const isSuspicious = this.checkSuspiciousPatterns(result);
        
        const recommendations: string[] = [];
        
        if (result.similarity > 0.8) {
            recommendations.push('高度相似，建议人工审查');
        }
        
        if (result.confidence < 0.5) {
            recommendations.push('置信度较低，建议结合其他证据');
        }
        
        if (result.details.length === 0) {
            recommendations.push('未发现显著匹配段落');
        } else if (result.details.length > 10) {
            recommendations.push('匹配段落较多，可能存在大面积抄袭');
        }
        
        const structuralRatio = result.details.length > 0 ? 
            result.details.filter(d => d.matchType === 'structural').length / result.details.length : 0;
        
        if (structuralRatio > 0.7) {
            recommendations.push('主要为结构性匹配，可能经过重构');
        }
        
        return {
            summary: this.generateSummary(result),
            quality,
            isSuspicious,
            recommendations
        };
    }

    /**
     * 查找相似代码段（基于 JPlag 算法）
     * 向后兼容方法，返回简化的相似段落格式
     */
    static findSimilarSegments(code1: string, code2: string, language: string, threshold = 0.7): any[] {
        const result = this.calculateEnhancedSimilarity(code1, code2, language);
        
        // 如果相似度低于阈值，返回空数组
        if (result.similarity < threshold) {
            return [];
        }
        
        // 转换为兼容格式
        return result.details.map((detail, index) => ({
            id: index,
            startPos1: detail.startLine1,
            endPos1: detail.endLine1,
            startPos2: detail.startLine2,
            endPos2: detail.endLine2,
            similarity: detail.similarity,
            content1: detail.codeFragment1,
            content2: detail.codeFragment2,
            algorithm: 'jplag'
        }));
    }

    /**
     * 获取详细分析结果（基于 JPlag 算法）
     * 向后兼容方法，返回通用分析格式
     */
    static getDetailedAnalysis(code1: string, code2: string, language: string): any {
        const result = this.calculateEnhancedSimilarity(code1, code2, language);
        
        return {
            similarity: result.similarity,
            confidence: result.confidence,
            algorithm: 'jplag',
            matches: result.details.map(detail => ({
                startA: detail.startLine1,
                endA: detail.endLine1,
                startB: detail.startLine2,
                endB: detail.endLine2,
                similarity: detail.similarity,
                tokenCount: detail.tokenCount,
                matchType: detail.matchType
            })),
            totalTokens1: result.totalTokens1,
            totalTokens2: result.totalTokens2,
            matchedTokens: result.matchedTokens,
            analysis: {
                structuralSimilarity: result.similarity,
                tokenizationMethod: 'structural',
                preprocessingApplied: true,
                excludeDeclarations: true,
                quality: this.getMatchQuality(result),
                isSuspicious: this.checkSuspiciousPatterns(result)
            }
        };
    }
}

// 导出默认实例
export default EnhancedCodeSimilarityAnalyzer;
