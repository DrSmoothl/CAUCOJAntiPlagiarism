/**
 * 简化版JPlag算法实现 (TypeScript版本)
 * 基于Greedy String Tiling算法进行代码相似性检测
 * 
 * 核心思路：
 * 1. 将代码转换为token序列
 * 2. 使用Greedy String Tiling算法寻找最长公共子序列
 * 3. 计算相似度并生成匹配段落
 */

// Token类型定义 - 基于原始JPlag的结构化token设计
export interface Token {
    type: string;           // token类型 (结构化token，如CLASS_BEGIN, IF_BEGIN等)
    value: string;          // token值 (仅用于调试，实际比较时不使用)
    line: number;           // 行号
    column: number;         // 列号
    semanticType?: string;  // 语义类型 (control, declaration, expression等)
}

// 匹配段落
export interface Match {
    startOfFirst: number;   // 第一个文件中的起始位置
    startOfSecond: number;  // 第二个文件中的起始位置
    lengthOfFirst: number;  // 第一个文件中的长度
    lengthOfSecond: number; // 第二个文件中的长度
    similarity: number;     // 该段落的相似度
}

// JPlag比较结果
export interface JPlagResult {
    similarity: number;     // 整体相似度
    matches: Match[];       // 匹配的代码段落
    totalTokens1: number;   // 第一个文件的token总数
    totalTokens2: number;   // 第二个文件的token总数
    matchedTokens: number;  // 匹配的token数量
}

// JPlag选项配置
export interface JPlagOptions {
    minimumTokenMatch: number;      // 最小匹配token数量 (默认12，原始JPlag推荐值)
    minimumSimilarity: number;      // 最小相似度阈值 (默认0.1)
    language: string;               // 编程语言
    ignoreCase: boolean;            // 是否忽略大小写
    ignoreComments: boolean;        // 是否忽略注释
    normalizeWhitespace: boolean;   // 是否标准化空白字符
    extractStructuralTokensOnly: boolean; // 是否只提取结构化token (默认true)
}

/**
 * 结构化Token提取器 - 基于原始JPlag设计
 * 只提取程序结构相关的token，忽略声明性语句和具体标识符
 */
export class StructuralTokenizer {
    private readonly language: string;
    private readonly options: JPlagOptions;

    constructor(language: string, options: JPlagOptions) {
        this.language = language;
        this.options = options;
    }

    /**
     * 将代码字符串转换为结构化token序列
     */
    tokenize(code: string): Token[] {
        const tokens: Token[] = [];
        const lines = code.split('\n');

        // 预处理：移除注释和预处理指令
        const cleanedLines = this.preprocessCode(lines);
        
        // 简单的状态机解析
        const parser = new SimpleStructuralParser(cleanedLines, this.language, this.options);
        return parser.extractStructuralTokens();
    }

    private preprocessCode(lines: string[]): string[] {
        return lines.map(line => {
            let cleanLine = line;
            
            // 移除C++风格注释
            cleanLine = cleanLine.replace(/\/\/.*$/, '');
            
            // 移除预处理指令 (这些不参与结构比较)
            if (this.language.toLowerCase() === 'cpp' || this.language.toLowerCase() === 'c++') {
                cleanLine = cleanLine.replace(/^\s*#.*$/, '');
                cleanLine = cleanLine.replace(/^\s*using\s+namespace\s+.*$/, ''); // 移除using namespace
                cleanLine = cleanLine.replace(/^\s*using\s+.*$/, ''); // 移除using声明
            }
            
            return cleanLine.trim();
        }).filter(line => line.length > 0);
    }
}

/**
 * 简单的结构化解析器
 * 专注于提取控制流和程序结构相关的token
 */
class SimpleStructuralParser {
    private lines: string[];
    private language: string;
    private options: JPlagOptions;
    private currentLine: number = 0;
    private braceStack: string[] = [];

    constructor(lines: string[], language: string, options: JPlagOptions) {
        this.lines = lines;
        this.language = language;
        this.options = options;
    }

    extractStructuralTokens(): Token[] {
        const tokens: Token[] = [];

        for (let i = 0; i < this.lines.length; i++) {
            this.currentLine = i + 1;
            const line = this.lines[i];
            const lineTokens = this.parseLine(line);
            tokens.push(...lineTokens);
        }

        return tokens;
    }

    private parseLine(line: string): Token[] {
        const tokens: Token[] = [];
        const trimmed = line.trim();

        if (trimmed.length === 0) return tokens;

        // C++特定的结构化token提取
        if (this.language.toLowerCase() === 'cpp' || this.language.toLowerCase() === 'c++') {
            tokens.push(...this.extractCppStructuralTokens(trimmed));
        } else if (this.language.toLowerCase() === 'java') {
            tokens.push(...this.extractJavaStructuralTokens(trimmed));
        } else if (this.language.toLowerCase() === 'python') {
            tokens.push(...this.extractPythonStructuralTokens(trimmed));
        }

        return tokens;
    }

    private extractCppStructuralTokens(line: string): Token[] {
        const tokens: Token[] = [];

        // 类定义
        if (/\b(class|struct)\s+\w+/.test(line)) {
            const isStruct = /\bstruct\s+/.test(line);
            tokens.push(this.createToken(isStruct ? 'STRUCT_BEGIN' : 'CLASS_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push(isStruct ? 'STRUCT' : 'CLASS');
            }
        }

        // 枚举定义
        if (/\benum\s+/.test(line)) {
            tokens.push(this.createToken('ENUM_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push('ENUM');
            }
        }

        // 联合定义
        if (/\bunion\s+/.test(line)) {
            tokens.push(this.createToken('UNION_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push('UNION');
            }
        }

        // 函数定义 (更精确的检测)
        if (this.isFunctionDefinition(line)) {
            tokens.push(this.createToken('FUNCTION_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push('FUNCTION');
            }
        }

        // 控制流语句
        if (/\bif\s*\(/.test(line)) {
            tokens.push(this.createToken('IF_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push('IF');
            }
        }

        if (/\belse\b/.test(line)) {
            tokens.push(this.createToken('ELSE', line, 'control'));
        }

        if (/\bfor\s*\(/.test(line)) {
            tokens.push(this.createToken('FOR_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push('FOR');
            }
        }

        if (/\bwhile\s*\(/.test(line)) {
            tokens.push(this.createToken('WHILE_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push('WHILE');
            }
        }

        if (/\bdo\s*\{/.test(line)) {
            tokens.push(this.createToken('DO_BEGIN', line, 'control'));
            this.braceStack.push('DO');
        }

        if (/\bswitch\s*\(/.test(line)) {
            tokens.push(this.createToken('SWITCH_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push('SWITCH');
            }
        }

        if (/\bcase\s+/.test(line)) {
            tokens.push(this.createToken('CASE', line, 'control'));
        }

        if (/\bdefault\s*:/.test(line)) {
            tokens.push(this.createToken('DEFAULT', line, 'control'));
        }

        // 跳转语句
        if (/\breturn\b/.test(line)) {
            tokens.push(this.createToken('RETURN', line, 'control'));
        }

        if (/\bbreak\b/.test(line)) {
            tokens.push(this.createToken('BREAK', line, 'control'));
        }

        if (/\bcontinue\b/.test(line)) {
            tokens.push(this.createToken('CONTINUE', line, 'control'));
        }

        if (/\bgoto\s+/.test(line)) {
            tokens.push(this.createToken('GOTO', line, 'control'));
        }

        // 异常处理
        if (/\btry\s*\{/.test(line)) {
            tokens.push(this.createToken('TRY_BEGIN', line, 'control'));
            this.braceStack.push('TRY');
        }

        if (/\bcatch\s*\(/.test(line)) {
            tokens.push(this.createToken('CATCH_BEGIN', line, 'control'));
            if (line.includes('{')) {
                this.braceStack.push('CATCH');
            }
        }

        if (/\bthrow\b/.test(line)) {
            tokens.push(this.createToken('THROW', line, 'control'));
        }

        // 变量定义 (仅结构性的，不关心具体变量名)
        if (this.isVariableDefinition(line)) {
            tokens.push(this.createToken('VARDEF', line, 'declaration'));
        }

        // 赋值操作
        if (/[^=!<>]=(?!=)/.test(line)) {
            tokens.push(this.createToken('ASSIGN', line, 'expression'));
        }

        // 函数调用
        if (this.isFunctionCall(line)) {
            tokens.push(this.createToken('APPLY', line, 'expression'));
        }

        // 对象创建
        if (/\bnew\s+\w+/.test(line)) {
            if (line.includes('[')) {
                tokens.push(this.createToken('NEWARRAY', line, 'expression'));
            } else {
                tokens.push(this.createToken('NEWCLASS', line, 'expression'));
            }
        }

        // 处理大括号 - 生成对应的END token
        if (line.includes('}')) {
            const blockType = this.braceStack.pop();
            if (blockType) {
                tokens.push(this.createToken(blockType + '_END', line, 'control'));
            }
        }

        return tokens;
    }

    private extractJavaStructuralTokens(line: string): Token[] {
        // Java结构化token提取（类似C++但有Java特性）
        const tokens: Token[] = [];
        // TODO: 实现Java特定的结构化token提取
        return tokens;
    }

    private extractPythonStructuralTokens(line: string): Token[] {
        // Python结构化token提取
        const tokens: Token[] = [];
        // TODO: 实现Python特定的结构化token提取
        return tokens;
    }

    private isFunctionDefinition(line: string): boolean {
        // 检测是否为函数定义 (而非声明或调用)
        // 简化版：包含参数列表且后面有大括号或在下一行有大括号
        const hasParams = /\w+\s*\([^)]*\)\s*/.test(line);
        const hasBody = line.includes('{') || line.endsWith(')');
        const notCall = !line.trim().endsWith(';');
        
        return hasParams && hasBody && notCall;
    }

    private isVariableDefinition(line: string): boolean {
        // 检测是否为变量定义 (简化版)
        const typeKeywords = ['int', 'char', 'float', 'double', 'long', 'short', 'bool', 'string', 'auto'];
        const hasType = typeKeywords.some(type => new RegExp(`\\b${type}\\s+\\w+`).test(line));
        const hasDeclaration = /\b\w+\s+\w+\s*[=;]/.test(line);
        
        return hasType || hasDeclaration;
    }

    private isFunctionCall(line: string): boolean {
        // 检测是否为函数调用
        const hasCall = /\w+\s*\([^)]*\)\s*;?/.test(line);
        const notDefinition = !this.isFunctionDefinition(line);
        
        return hasCall && notDefinition;
    }

    private createToken(type: string, value: string, semanticType: string): Token {
        return {
            type,
            value: value.trim(),
            line: this.currentLine,
            column: 1,
            semanticType
        };
    }
}

/**
 * Greedy String Tiling算法实现
 * 核心的相似性检测算法
 */
export class GreedyStringTiling {
    private readonly options: JPlagOptions;

    constructor(options: JPlagOptions) {
        this.options = options;
    }

    /**
     * 比较两个token序列，返回JPlag结果
     */
    compare(tokens1: Token[], tokens2: Token[]): JPlagResult {
        const matches: Match[] = [];
        const marked1 = new Set<number>();
        const marked2 = new Set<number>();

        // 反复寻找最长公共子序列，直到找不到更长的匹配
        while (true) {
            const longestMatch = this.findLongestMatch(tokens1, tokens2, marked1, marked2);
            
            if (!longestMatch || longestMatch.lengthOfFirst < this.options.minimumTokenMatch) {
                break;
            }

            matches.push(longestMatch);
            
            // 标记已匹配的token
            for (let i = 0; i < longestMatch.lengthOfFirst; i++) {
                marked1.add(longestMatch.startOfFirst + i);
            }
            for (let i = 0; i < longestMatch.lengthOfSecond; i++) {
                marked2.add(longestMatch.startOfSecond + i);
            }
        }

        // 计算相似度
        const totalTokens1 = tokens1.length;
        const totalTokens2 = tokens2.length;
        const matchedTokens = matches.reduce((sum, match) => sum + match.lengthOfFirst, 0);
        
        const similarity = this.calculateSimilarity(matchedTokens, totalTokens1, totalTokens2);

        return {
            similarity,
            matches: matches.sort((a, b) => a.startOfFirst - b.startOfFirst),
            totalTokens1,
            totalTokens2,
            matchedTokens
        };
    }

    private findLongestMatch(
        tokens1: Token[], 
        tokens2: Token[], 
        marked1: Set<number>, 
        marked2: Set<number>
    ): Match | null {
        let bestMatch: Match | null = null;
        let maxLength = 0;

        for (let i = 0; i < tokens1.length; i++) {
            if (marked1.has(i)) continue;

            for (let j = 0; j < tokens2.length; j++) {
                if (marked2.has(j)) continue;

                const match = this.extendMatch(tokens1, tokens2, i, j, marked1, marked2);
                if (match && match.lengthOfFirst > maxLength) {
                    maxLength = match.lengthOfFirst;
                    bestMatch = match;
                }
            }
        }

        return bestMatch;
    }

    private extendMatch(
        tokens1: Token[], 
        tokens2: Token[], 
        start1: number, 
        start2: number,
        marked1: Set<number>, 
        marked2: Set<number>
    ): Match | null {
        let length = 0;
        let i = start1;
        let j = start2;

        // 向前扩展匹配
        while (
            i < tokens1.length && 
            j < tokens2.length && 
            !marked1.has(i) && 
            !marked2.has(j) && 
            this.tokensEqual(tokens1[i], tokens2[j])
        ) {
            length++;
            i++;
            j++;
        }

        if (length >= this.options.minimumTokenMatch) {
            return {
                startOfFirst: start1,
                startOfSecond: start2,
                lengthOfFirst: length,
                lengthOfSecond: length,
                similarity: 1.0
            };
        }

        return null;
    }

    private tokensEqual(token1: Token, token2: Token): boolean {
        // 对于结构化token，只比较类型，不比较具体值
        if (this.options.extractStructuralTokensOnly) {
            return token1.type === token2.type;
        }
        
        // 传统模式：比较token的类型和值
        if (token1.type !== token2.type) return false;
        
        return token1.value === token2.value;
    }

    private calculateSimilarity(matchedTokens: number, totalTokens1: number, totalTokens2: number): number {
        if (totalTokens1 === 0 && totalTokens2 === 0) return 1.0;
        if (totalTokens1 === 0 || totalTokens2 === 0) return 0.0;
        
        // 使用Jaccard相似度的变体
        const maxTokens = Math.max(totalTokens1, totalTokens2);
        return (2.0 * matchedTokens) / (totalTokens1 + totalTokens2);
    }
}

/**
 * 结构化JPlag主类 - 基于原始JPlag设计
 * 协调整个检测流程，专注于程序结构相似性
 */
export class SimpleJPlag {
    private readonly options: JPlagOptions;
    private readonly tokenizer: StructuralTokenizer;
    private readonly algorithm: GreedyStringTiling;

    constructor(options: Partial<JPlagOptions> = {}) {
        this.options = {
            minimumTokenMatch: 12,  // 提高到原始JPlag推荐值
            minimumSimilarity: 0.1,
            language: 'cpp',
            ignoreCase: false,
            ignoreComments: true,
            normalizeWhitespace: true,
            extractStructuralTokensOnly: true,  // 默认启用结构化模式
            ...options
        };

        this.tokenizer = new StructuralTokenizer(this.options.language, this.options);
        this.algorithm = new GreedyStringTiling(this.options);
    }

    /**
     * 比较两个代码字符串的相似性
     */
    compare(code1: string, code2: string): JPlagResult {
        // 预处理代码
        const processedCode1 = this.preprocessCode(code1);
        const processedCode2 = this.preprocessCode(code2);

        // 结构化Token化
        const tokens1 = this.tokenizer.tokenize(processedCode1);
        const tokens2 = this.tokenizer.tokenize(processedCode2);

        // 如果token数量太少，直接返回0相似度
        if (tokens1.length < this.options.minimumTokenMatch || tokens2.length < this.options.minimumTokenMatch) {
            return {
                similarity: 0,
                matches: [],
                totalTokens1: tokens1.length,
                totalTokens2: tokens2.length,
                matchedTokens: 0
            };
        }

        // 执行比较算法
        const result = this.algorithm.compare(tokens1, tokens2);

        // 过滤低相似度结果
        if (result.similarity < this.options.minimumSimilarity) {
            return {
                ...result,
                matches: []
            };
        }

        return result;
    }

    private preprocessCode(code: string): string {
        let processed = code;

        // 移除C++特有的声明性语句，这些不应影响结构相似性
        if (this.options.language.toLowerCase() === 'cpp' || this.options.language.toLowerCase() === 'c++') {
            // 移除include指令
            processed = processed.replace(/^\s*#include\s+.*$/gm, '');
            
            // 移除using namespace和using声明
            processed = processed.replace(/^\s*using\s+namespace\s+.*$/gm, '');
            processed = processed.replace(/^\s*using\s+.*$/gm, '');
            
            // 移除宏定义
            processed = processed.replace(/^\s*#define\s+.*$/gm, '');
            processed = processed.replace(/^\s*#ifdef\s+.*$/gm, '');
            processed = processed.replace(/^\s*#ifndef\s+.*$/gm, '');
            processed = processed.replace(/^\s*#endif\s*$/gm, '');
            
            // 移除extern声明
            processed = processed.replace(/^\s*extern\s+.*$/gm, '');
        }

        if (this.options.normalizeWhitespace) {
            // 标准化空白字符，但保持行结构
            processed = processed.replace(/[ \t]+/g, ' ');
            processed = processed.replace(/\n\s*\n/g, '\n');
        }

        return processed.trim();
    }

    /**
     * 获取详细的匹配信息，包括原始代码段
     */
    getDetailedMatches(code1: string, code2: string, result: JPlagResult): Array<{
        match: Match;
        code1Fragment: string;
        code2Fragment: string;
        lines1: { start: number; end: number };
        lines2: { start: number; end: number };
    }> {
        const lines1 = code1.split('\n');
        const lines2 = code2.split('\n');
        const tokens1 = this.tokenizer.tokenize(code1);
        const tokens2 = this.tokenizer.tokenize(code2);

        return result.matches.map(match => {
            // 计算匹配段落的行范围
            const startLine1 = tokens1[match.startOfFirst]?.line || 1;
            const endLine1 = tokens1[match.startOfFirst + match.lengthOfFirst - 1]?.line || 1;
            const startLine2 = tokens2[match.startOfSecond]?.line || 1;
            const endLine2 = tokens2[match.startOfSecond + match.lengthOfSecond - 1]?.line || 1;

            // 提取代码片段
            const code1Fragment = lines1.slice(startLine1 - 1, endLine1).join('\n');
            const code2Fragment = lines2.slice(startLine2 - 1, endLine2).join('\n');

            return {
                match,
                code1Fragment,
                code2Fragment,
                lines1: { start: startLine1, end: endLine1 },
                lines2: { start: startLine2, end: endLine2 }
            };
        });
    }

    /**
     * 获取代码的结构化token统计信息
     */
    getTokenStatistics(code: string): {
        totalTokens: number;
        tokensByType: Map<string, number>;
        structuralComplexity: number;
    } {
        const tokens = this.tokenizer.tokenize(code);
        const tokensByType = new Map<string, number>();
        
        tokens.forEach(token => {
            tokensByType.set(token.type, (tokensByType.get(token.type) || 0) + 1);
        });

        // 计算结构复杂度 (控制流token的数量)
        const controlTokens = ['IF_BEGIN', 'FOR_BEGIN', 'WHILE_BEGIN', 'SWITCH_BEGIN', 'TRY_BEGIN'];
        const structuralComplexity = controlTokens.reduce((sum, type) => 
            sum + (tokensByType.get(type) || 0), 0);

        return {
            totalTokens: tokens.length,
            tokensByType,
            structuralComplexity
        };
    }
}

// 默认导出
export default SimpleJPlag;
