/**
 * 简化版JPlag算法实现 (TypeScript版本)
 * 基于Greedy String Tiling算法进行代码相似性检测
 * 
 * 核心思路：
 * 1. 将代码转换为token序列
 * 2. 使用Greedy String Tiling算法寻找最长公共子序列
 * 3. 计算相似度并生成匹配段落
 */

// Token类型定义
export interface Token {
    type: string;           // token类型 (keyword, identifier, operator等)
    value: string;          // token值
    line: number;           // 行号
    column: number;         // 列号
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
    minimumTokenMatch: number;      // 最小匹配token数量 (默认9)
    minimumSimilarity: number;      // 最小相似度阈值 (默认0.1)
    language: string;               // 编程语言
    ignoreCase: boolean;            // 是否忽略大小写
    ignoreComments: boolean;        // 是否忽略注释
    normalizeWhitespace: boolean;   // 是否标准化空白字符
}

/**
 * 简化版Token化器
 * 将代码转换为token序列
 */
export class SimpleTokenizer {
    private readonly language: string;
    private readonly options: JPlagOptions;

    constructor(language: string, options: JPlagOptions) {
        this.language = language;
        this.options = options;
    }

    /**
     * 将代码字符串转换为token序列
     */
    tokenize(code: string): Token[] {
        const tokens: Token[] = [];
        const lines = code.split('\n');

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const lineTokens = this.tokenizeLine(line, lineIndex + 1);
            tokens.push(...lineTokens);
        }

        return this.filterTokens(tokens);
    }

    private tokenizeLine(line: string, lineNumber: number): Token[] {
        const tokens: Token[] = [];
        
        // 简单的token模式匹配
        const patterns = this.getLanguagePatterns();
        let remainingLine = line;
        let column = 0;

        while (remainingLine.length > 0) {
            let matched = false;

            for (const [pattern, type] of patterns) {
                const match = remainingLine.match(pattern);
                if (match && match.index === 0) {
                    const value = match[0];
                    
                    if (type !== 'whitespace' && (!this.options.ignoreComments || type !== 'comment')) {
                        tokens.push({
                            type,
                            value: this.options.ignoreCase ? value.toLowerCase() : value,
                            line: lineNumber,
                            column: column + 1
                        });
                    }

                    remainingLine = remainingLine.substring(value.length);
                    column += value.length;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                // 跳过无法识别的字符
                remainingLine = remainingLine.substring(1);
                column++;
            }
        }

        return tokens;
    }

    private getLanguagePatterns(): [RegExp, string][] {
        // 根据编程语言返回不同的token模式
        switch (this.language.toLowerCase()) {
            case 'cpp':
            case 'c++':
            case 'c':
                return [
                    [/\/\/.*/, 'comment'],                          // 单行注释
                    [/\/\*[\s\S]*?\*\//, 'comment'],               // 多行注释
                    [/\b(if|else|for|while|do|switch|case|break|continue|return|int|char|float|double|void|class|struct|public|private|protected|virtual|static|const|namespace|using|include)\b/, 'keyword'],
                    [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier'],  // 标识符
                    [/\b\d+(\.\d+)?\b/, 'number'],                 // 数字
                    [/"[^"]*"/, 'string'],                         // 字符串
                    [/'[^']*'/, 'char'],                           // 字符
                    [/[+\-*\/%=!<>&|^~]/, 'operator'],             // 运算符
                    [/[{}()\[\];,.]/, 'punctuation'],             // 标点符号
                    [/\s+/, 'whitespace']                          // 空白字符
                ];
            
            case 'java':
                return [
                    [/\/\/.*/, 'comment'],
                    [/\/\*[\s\S]*?\*\//, 'comment'],
                    [/\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while)\b/, 'keyword'],
                    [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier'],
                    [/\b\d+(\.\d+)?[fFdDlL]?\b/, 'number'],
                    [/"[^"]*"/, 'string'],
                    [/'[^']*'/, 'char'],
                    [/[+\-*\/%=!<>&|^~?:]/, 'operator'],
                    [/[{}()\[\];,.]/, 'punctuation'],
                    [/\s+/, 'whitespace']
                ];
            
            case 'python':
                return [
                    [/#.*/, 'comment'],
                    [/"""[\s\S]*?"""/, 'comment'],
                    [/'''[\s\S]*?'''/, 'comment'],
                    [/\b(and|as|assert|break|class|continue|def|del|elif|else|except|exec|finally|for|from|global|if|import|in|is|lambda|not|or|pass|print|raise|return|try|while|with|yield|True|False|None)\b/, 'keyword'],
                    [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier'],
                    [/\b\d+(\.\d+)?\b/, 'number'],
                    [/"[^"]*"/, 'string'],
                    [/'[^']*'/, 'string'],
                    [/[+\-*\/%=!<>&|^~]/, 'operator'],
                    [/[{}()\[\]:;,.]/, 'punctuation'],
                    [/\s+/, 'whitespace']
                ];
            
            default:
                // 通用模式
                return [
                    [/\/\/.*/, 'comment'],
                    [/\/\*[\s\S]*?\*\//, 'comment'],
                    [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier'],
                    [/\b\d+(\.\d+)?\b/, 'number'],
                    [/"[^"]*"/, 'string'],
                    [/'[^']*'/, 'string'],
                    [/[+\-*\/%=!<>&|^~]/, 'operator'],
                    [/[{}()\[\];,.]/, 'punctuation'],
                    [/\s+/, 'whitespace']
                ];
        }
    }

    private filterTokens(tokens: Token[]): Token[] {
        return tokens.filter(token => {
            // 过滤空白字符和可选的注释
            if (token.type === 'whitespace') return false;
            if (this.options.ignoreComments && token.type === 'comment') return false;
            return true;
        });
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
        // 比较token的类型和值
        if (token1.type !== token2.type) return false;
        
        // 对于标识符，可以选择是否进行严格匹配
        if (token1.type === 'identifier' && this.options.language !== 'plaintext') {
            // 对于关键字和运算符，严格匹配
            return token1.value === token2.value;
        }
        
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
 * 简化版JPlag主类
 * 协调整个检测流程
 */
export class SimpleJPlag {
    private readonly options: JPlagOptions;
    private readonly tokenizer: SimpleTokenizer;
    private readonly algorithm: GreedyStringTiling;

    constructor(options: Partial<JPlagOptions> = {}) {
        this.options = {
            minimumTokenMatch: 9,
            minimumSimilarity: 0.1,
            language: 'cpp',
            ignoreCase: false,
            ignoreComments: true,
            normalizeWhitespace: true,
            ...options
        };

        this.tokenizer = new SimpleTokenizer(this.options.language, this.options);
        this.algorithm = new GreedyStringTiling(this.options);
    }

    /**
     * 比较两个代码字符串的相似性
     */
    compare(code1: string, code2: string): JPlagResult {
        // 预处理代码
        const processedCode1 = this.preprocessCode(code1);
        const processedCode2 = this.preprocessCode(code2);

        // Token化
        const tokens1 = this.tokenizer.tokenize(processedCode1);
        const tokens2 = this.tokenizer.tokenize(processedCode2);

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

        if (this.options.normalizeWhitespace) {
            // 标准化空白字符
            processed = processed.replace(/\s+/g, ' ').trim();
        }

        return processed;
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
}

// 默认导出
export default SimpleJPlag;
