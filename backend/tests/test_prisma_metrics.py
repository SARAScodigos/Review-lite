"""Regresión de exportación PRISMA sin servicios externos ni base de datos."""
import ast
from pathlib import Path
from types import SimpleNamespace as Row
import unittest


class Query:
    def join(self, *args):
        return self

    def where(self, *args):
        return self


class Model:
    project_id = id = record_id = file_id = screening_session_id = 0


class Result:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class Database:
    def __init__(self, records, decisions, pdfs):
        self.results = iter([records, decisions, pdfs])

    def exec(self, query):
        return Result(next(self.results))


def load_metrics():
    source = Path(__file__).parents[1] / 'app/api/services/prisma_export_service.py'
    tree = ast.parse(source.read_text())
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'get_prisma_metrics')
    namespace = dict(Session=object, uuid=Row(UUID=object), Dict=dict,
                     ExtractedRecord=Model, SearchResultFile=Model, ScreeningDecision=Model,
                     ArticlePDF=Model, select=lambda *args: Query(),
                     ScreeningDecisionEnum=Row(INCLUDED='INCLUDED', EXCLUDED='EXCLUDED',
                                              PENDING='PENDING', EVALUATING='EVALUATING', MAYBE='MAYBE'),
                     PDFDownloadStatus=Row(DOWNLOADED='DOWNLOADED', MANUALLY_UPLOADED='MANUALLY_UPLOADED'),
                     _get_prisma_context=lambda *args: (None, Row(id=1)))
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)
    return namespace['get_prisma_metrics']


def decision(record_id, abstract='INCLUDED', final='PENDING', duplicate=False):
    return Row(record_id=record_id, is_duplicate=duplicate, title_status='PENDING',
               abstract_status=abstract, fulltext_status='PENDING', final_decision=final)


class PrismaMetricsTests(unittest.TestCase):
    def test_advanced_abstracts_survive_pending_title_and_stale_counters(self):
        rows = [decision(1, final='INCLUDED'), decision(2), decision(3, abstract='EXCLUDED')]
        pdfs = [Row(record_id=i, file_path='article.pdf', download_status='DOWNLOADED') for i in (1, 2)]
        metrics = load_metrics()(Database([1, 2, 3], rows, pdfs), 1)
        self.assertEqual(metrics['title_included_count'], 3)
        self.assertEqual(metrics['fulltext_sought_count'], 2)
        self.assertEqual(metrics['fulltext_retrieved_count'], 2)
        self.assertEqual(metrics['fulltext_included_count'], 1)
        self.assertEqual(metrics['fulltext_pending_count'], 1)

    def test_pending_abstract_is_not_automatically_a_failed_retrieval(self):
        metrics = load_metrics()(Database([1], [decision(1, abstract='PENDING')], []), 1)
        self.assertEqual(metrics['fulltext_sought_count'], 0)

    def test_duplicates_are_excluded_and_missing_pdf_is_counted(self):
        metrics = load_metrics()(Database([1, 2], [decision(1), decision(2, duplicate=True)], []), 1)
        self.assertEqual(metrics['duplicate_records_count'], 1)
        self.assertEqual(metrics['unique_records_count'], 1)
        self.assertEqual(metrics['fulltext_sought_count'], 1)
        self.assertEqual(metrics['fulltext_not_retrieved_count'], 1)
        self.assertEqual(metrics['fulltext_included_count'], 0)


if __name__ == '__main__':
    unittest.main()
