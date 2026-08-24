import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import type { Document } from "@langchain/core/documents"
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { type TextSplitterConfig } from "./src/config.ts"

export class DocumentProcessor {
    private pdfPaths: readonly string[]
    private textSplitterConfig: TextSplitterConfig

    constructor(pdfPaths: readonly string[], textSplitterConfig: TextSplitterConfig) {
        this.pdfPaths = pdfPaths
        this.textSplitterConfig = textSplitterConfig
    }

    async loadAndSplit() {
        const rawDocuments: Document[] = []

        for (const pdfPath of this.pdfPaths) {
            const loader = new PDFLoader(pdfPath)
            const pdfDocuments = await loader.load()
            rawDocuments.push(...pdfDocuments)
            console.log(`📄 Loaded ${pdfDocuments.length} pages from ${pdfPath}`);
        }

        console.log(`📚 Loaded ${rawDocuments.length} pages from ${this.pdfPaths.length} PDFs`);

        const splitter = new RecursiveCharacterTextSplitter(
            this.textSplitterConfig
        )
        const documents = await splitter.splitDocuments(rawDocuments)
        console.log(`✂️  Split into ${documents.length} chunks`);

        return documents.map(doc => ({
            ...doc,
            metadata: {
                source: doc.metadata.source,
            }
        }))
    }
}
