import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import type { Document } from "@langchain/core/documents"
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { basename } from "node:path"
import { type PdfSource, type TextSplitterConfig } from "./src/config.ts"
import { normalizarDocumento } from "./src/textNormalizer.ts"
import { CATALOGO, type Mensagens } from "../compartilhado/idiomas.ts"

export class DocumentProcessor {
    private pdfSources: readonly PdfSource[]
    private textSplitterConfig: TextSplitterConfig
    private normalizar: boolean
    private msg: Mensagens

    constructor(
        pdfSources: readonly PdfSource[],
        textSplitterConfig: TextSplitterConfig,
        normalizar = false,
        msg: Mensagens = CATALOGO.pt,
    ) {
        this.pdfSources = pdfSources
        this.textSplitterConfig = textSplitterConfig
        this.normalizar = normalizar
        this.msg = msg
    }

    async loadAndSplit() {
        const rawDocuments: Document[] = []

        for (const source of this.pdfSources) {
            const loader = new PDFLoader(source.path)
            const pdfDocuments = await loader.load()

            if (this.normalizar) {
                // Normaliza com o documento inteiro em mãos: cabeçalhos e rodapés
                // só se revelam pela repetição entre as páginas.
                const textos = normalizarDocumento(pdfDocuments.map(d => d.pageContent))
                pdfDocuments.forEach((doc, i) => { doc.pageContent = textos[i]! })
            }

            const selectedPages = this.selectPages(pdfDocuments, source)
            rawDocuments.push(...selectedPages)

            const { paginasDe, recorte } = this.msg.embeddings
            const trecho = selectedPages.length === pdfDocuments.length
                ? ""
                : recorte(source.pages![0], source.pages![1], pdfDocuments.length)
            console.log(paginasDe(selectedPages.length, source.path, trecho));
        }

        console.log(this.msg.embeddings.totalPaginas(rawDocuments.length, this.pdfSources.length));

        const splitter = new RecursiveCharacterTextSplitter(
            this.textSplitterConfig
        )
        const documents = await splitter.splitDocuments(rawDocuments)
        console.log(this.msg.embeddings.dividido(documents.length));

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
