import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import type { Document } from "@langchain/core/documents"
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { basename } from "node:path"
import { type PdfSource, type TextSplitterConfig } from "./src/config.ts"

export class DocumentProcessor {
    private pdfSources: readonly PdfSource[]
    private textSplitterConfig: TextSplitterConfig

    constructor(pdfSources: readonly PdfSource[], textSplitterConfig: TextSplitterConfig) {
        this.pdfSources = pdfSources
        this.textSplitterConfig = textSplitterConfig
    }

    async loadAndSplit() {
        const rawDocuments: Document[] = []

        for (const source of this.pdfSources) {
            const loader = new PDFLoader(source.path)
            const pdfDocuments = await loader.load()
            const selectedPages = this.selectPages(pdfDocuments, source)
            rawDocuments.push(...selectedPages)

            const recorte = selectedPages.length === pdfDocuments.length
                ? ""
                : ` (páginas ${source.pages?.[0]}-${source.pages?.[1]} de ${pdfDocuments.length})`
            console.log(`📄 Loaded ${selectedPages.length} pages from ${source.path}${recorte}`);
        }

        console.log(`📚 Loaded ${rawDocuments.length} pages from ${this.pdfSources.length} PDFs`);

        const splitter = new RecursiveCharacterTextSplitter(
            this.textSplitterConfig
        )
        const documents = await splitter.splitDocuments(rawDocuments)
        console.log(`✂️  Split into ${documents.length} chunks`);

        // O Neo4j só armazena valores primitivos nas propriedades do nó, por isso
        // a metadata aninhada do PDFLoader (loc.pageNumber, pdf.info) é achatada.
        return documents.map(doc => ({
            ...doc,
            metadata: {
                source: doc.metadata.source,
                fileName: basename(doc.metadata.source ?? ""),
                pageNumber: doc.metadata.loc?.pageNumber ?? null,
                totalPages: doc.metadata.pdf?.totalPages ?? null,
            }
        }))
    }

    // Permite indexar apenas parte de um PDF, quando o documento reúne
    // assuntos distintos em capítulos separados.
    private selectPages(documents: Document[], source: PdfSource): Document[] {
        if (!source.pages) return documents

        const [firstPage, lastPage] = source.pages
        return documents.filter(doc => {
            const pageNumber = doc.metadata.loc?.pageNumber
            return typeof pageNumber === "number"
                && pageNumber >= firstPage
                && pageNumber <= lastPage
        })
    }
}
