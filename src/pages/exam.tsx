import { Box, Center, Flex, IconButton, Text } from "@chakra-ui/react";
import { Button, Modal } from "@freecodecamp/ui";
import { useState, useEffect, useRef } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@chakra-ui/icons";
import { confirm } from "@tauri-apps/plugin-dialog";
import { CloseRequestedEvent } from "@tauri-apps/api/window";
import {
  Answers,
  FullQuestion,
  UserExam,
  UserExamAttempt,
} from "../utils/types";
import { Camera } from "../components/camera";
import { useAppFocus } from "../components/use-app-focus";
import { QuestionSetForm } from "../components/question-set-form";
import { usePreventImmediateExit } from "../components/use-prevent-immediate-exit";
import { takeScreenshot } from "../utils/screenshot";
import { useLoaderData, useNavigate } from "react-router-dom";
import { postExamAttempt } from "../utils/fetch";
import OfflineModal from "../components/offline-modal";

export function Exam() {
  const examData = useLoaderData() as {
    exam: UserExam;
    examAttempt: UserExamAttempt;
  };
  const navigate = useNavigate();
  const { exam } = examData;
  const [examAttempt, setExamAttempt] = useState<UserExamAttempt>(
    examData.examAttempt
  );
  const [newSelectedAnswers, setNewSelectedAnswers] = useState<
    Answers[number]["id"][]
  >([]);

  const [fullQuestion, setFullQuestion] = useState<FullQuestion>(
    fullQuestionFromExamAttempt(exam, examAttempt)
  );

  const [isOffline, setIsOffline] = useState(false);

  const [maxTimeReached, setMaxTimeReached] = useState(false);
  const [hasFinishedExam, setHasFinishedExam] = useState(false);
  const secondsLeft = Math.floor(
    (examAttempt.startTimeInMS + exam.config.totalTimeInMS - Date.now()) / 1000
  );

  useEffect(() => {
    const handleExamAttempt = async () => {
      try {
        const response = await postExamAttempt(examAttempt);

        if (!response || response.status !== 200) {
          setIsOffline(true);
          return;
        }

        setIsOffline(false);

        if (currentQuestionNumber < questions.length) {
          nextQuestion();
        } else {
          setHasFinishedExam(true);
        }
      } catch (error) {
        setIsOffline(true);
      }
    };

    handleExamAttempt();
  }, [examAttempt]);

  function fullQuestionFromExamAttempt(
    exam: UserExam,
    examAttempt: UserExamAttempt
  ): FullQuestion {
    const questionSets = examAttempt.questionSets;

    if (!questionSets.length) {
      // TODO: Bad
      return {
        questionSet: exam.questionSets.at(0)!,
        ...exam.questionSets.at(0)!.questions!.at(0)!,
      };
    }

    const latestQuestionTypeIndex = questionSets.length;
    const latestQuestionIndex = questionSets.at(-1)?.questions?.length ?? 1;

    const questionSet = exam.questionSets.at(latestQuestionTypeIndex - 1)!;
    const fullQuestion = {
      questionSet,
      ...questionSet.questions.at(latestQuestionIndex - 1)!,
    };

    return fullQuestion;
  }

  async function onCloseRequested(event: CloseRequestedEvent) {
    const confirmed = await confirm("Are you sure you want to exit?");
    if (!confirmed) {
      event.preventDefault();
    }
  }

  usePreventImmediateExit({
    onCloseRequested,
  });

  async function onFocusChanged(focused: boolean) {
    console.log(`App ${focused ? "is" : "is not"} focused`);
    const { error } = await takeScreenshot();
    if (error) {
      console.error("TODO: Unable to take screenshot");
    }
  }

  useAppFocus({
    onFocusChanged,
  });

  function handleCloseModal() {
    setHasFinishedExam(false);

    if (maxTimeReached) {
      setHasFinishedExam(true);
    }
  }

  if (!exam || !fullQuestion || !examAttempt) {
    return null;
  }

  const questions = exam.questionSets.flatMap((qt) => {
    return qt.questions;
  });

  const currentQuestionNumber =
    questions.findIndex((q) => q.id === fullQuestion?.id) + 1;

  function nextQuestion() {
    if (!exam || !fullQuestion) {
      return;
    }

    const nextQ = questions[currentQuestionNumber];

    const questionSet = exam.questionSets.find((qt) =>
      qt.questions.some((q) => q.id === nextQ.id)
    );
    if (!questionSet) {
      return;
    }

    const next = {
      ...nextQ,
      questionSet,
    };
    setFullQuestion(next);
  }

  function specificQuestion(question_num: number) {
    if (!exam || !fullQuestion) {
      return;
    }

    const specificQ = questions[question_num - 1];

    const questionSet = exam.questionSets.find((qt) =>
      qt.questions.some((q) => q.id === specificQ.id)
    );

    if (!questionSet) {
      return;
    }

    const specific = {
      ...specificQ,
      questionSet,
    };
    setFullQuestion(specific);
  }

  function previousQuestion() {
    if (!exam || !fullQuestion) {
      return;
    }

    const prevQ = questions[currentQuestionNumber - 2];
    const questionSet = exam.questionSets.find((qt) =>
      qt.questions.some((q) => q.id === prevQ.id)
    );
    if (!questionSet) {
      return;
    }

    const prev = {
      ...prevQ,
      questionSet,
    };
    setFullQuestion(prev);
  }

  function isAnswered(question_num: number) {
    if (!fullQuestion || !examAttempt) {
      return false;
    }

    const question = questions[question_num - 1];

    const questionSet = examAttempt.questionSets.find((qt) =>
      qt.questions.some((q) => q.id === question.id)
    );

    if (!questionSet) {
      return false;
    }

    const q = questionSet.questions.find((q) => q.id === question.id);

    return q !== undefined;
  }

  function answeredAll() {
    if (!fullQuestion || !examAttempt) {
      return false;
    }

    const answeredQuestions = examAttempt.questionSets
      .map((qt) => qt.questions.map((question) => question.id))
      .flat();
    const allQuestionIds = questions.map((question) => question.id);

    for (let i = 0; i < allQuestionIds.length; i++) {
      if (!answeredQuestions.includes(allQuestionIds[i])) {
        return false;
      }
    }
    return true;
  }

  async function submitQuestion(
    fullQuestion: FullQuestion,
    selectedAnswers: Answers[number]["id"][]
  ) {
    if (!examAttempt) {
      throw "Unreachable. Exam attempt should exist";
    }

    const questionSets = examAttempt.questionSets;
    const qs = questionSets.find((q) => q.id === fullQuestion.questionSet.id);
    if (qs) {
      const q = qs.questions.find((q) => q.id === fullQuestion.id);
      if (q) {
        q.answers = selectedAnswers;
      } else {
        qs.questions.push({ id: fullQuestion.id, answers: selectedAnswers });
      }
    } else {
      questionSets.push({
        id: fullQuestion.questionSet.id,
        questions: [{ id: fullQuestion.id, answers: selectedAnswers }],
      });
    }

    const updatedExamAttempt = {
      ...examAttempt,
      questionSets,
    };

    setExamAttempt(updatedExamAttempt);
  }

  function handleExamEnd() {
    navigate("/landing");
  }

  return (
    <>
      <Box
        display={"flex"}
        zIndex={"-1"}
        justifyContent={"flex-end"}
        position={"fixed"}
        width={"100%"}
      >
        <Camera height={100} width={200} autoPlay />
      </Box>
      <Box width={"full"} m="1em" mt="4em">
        <Center height={"100%"}>
          <OfflineModal
            isOffline={isOffline}
            submitQuestion={submitQuestion}
            fullQuestion={fullQuestion}
            selectedAnswers={newSelectedAnswers}
          />
          <Box
            display={"flex"}
            flexDirection={"column"}
            border={"1px"}
            borderColor={"gray.300"}
            width={"65%"}
            minHeight={"80vh"}
            maxHeight={"80vh"}
            overflow={"auto"}
            p={"1.5em"}
          >
            <Flex justifyContent={"space-between"}>
              <Text
                fontWeight={"bold"}
              >{`Question ${currentQuestionNumber} of ${questions.length}`}</Text>
              <Timer
                secondsLeft={secondsLeft}
                setHasFinishedExam={setHasFinishedExam}
                setMaxTimeReached={setMaxTimeReached}
              />
            </Flex>
            <QuestionSetForm
              fullQuestion={fullQuestion}
              submitQuestion={submitQuestion}
              examAttempt={examAttempt}
              setNewSelectedAnswers={setNewSelectedAnswers}
              newSelectedAnswers={newSelectedAnswers}
              maxTimeReached={maxTimeReached}
            />
          </Box>
        </Center>
      </Box>
      <NavigationBubbles
        questions={questions}
        currentQuestionNumber={currentQuestionNumber}
        specificQuestion={specificQuestion}
        isAnswered={isAnswered}
        nextQuestion={nextQuestion}
        previousQuestion={previousQuestion}
      />
      <Modal onClose={handleCloseModal} open={hasFinishedExam}>
        <Modal.Header showCloseButton={!maxTimeReached}>
          {maxTimeReached ? "Time's up!" : "Submit Exam"}
        </Modal.Header>
        <Modal.Body>
          {!maxTimeReached && !answeredAll() && (
            <Text color="tomato" fontWeight={"bold"}>
              It seems you haven't answered all questions, are you sure you want
              to quit the exam?
            </Text>
          )}
          <Text>Thank you for taking the exam.</Text>
        </Modal.Body>
        <Modal.Footer>
          <Button block={true} onClick={handleExamEnd}>
            End Exam
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

type TimerProps = {
  secondsLeft: number;
  setHasFinishedExam: (b: boolean) => void;
  setMaxTimeReached: (b: boolean) => void;
};

type NavigationBubblesProps = {
  questions: any[];
  currentQuestionNumber: number;
  specificQuestion: (question_num: number) => void;
  isAnswered: (question_num: number) => boolean;
  nextQuestion: () => void;
  previousQuestion: () => void;
};

function Timer({
  secondsLeft,
  setHasFinishedExam,
  setMaxTimeReached,
}: TimerProps) {
  const [availableTime, setAvailableTime] = useState(secondsLeft);
  const startTimeRef = useRef<Date | null>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    startTimeRef.current = new Date();

    const updateTimer = () => {
      if (startTimeRef.current) {
        const elapsed = Math.floor(
          (new Date().getTime() - startTimeRef.current.getTime()) / 1000
        );
        const timeLeft = Math.max(secondsLeft - elapsed, 0);

        if (timeLeft === 0) {
          setHasFinishedExam(true);
          setMaxTimeReached(true);
        }

        setAvailableTime(timeLeft);
      }

      if (availableTime > 0) {
        requestRef.current = requestAnimationFrame(updateTimer);
      }
    };

    requestRef.current = requestAnimationFrame(updateTimer);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [secondsLeft]);

  return <Text fontWeight={"bold"}>Time: {secondsToMMSS(availableTime)}</Text>;
}

function NavigationBubbles({
  questions,
  currentQuestionNumber,
  specificQuestion,
  isAnswered,
  nextQuestion,
  previousQuestion,
}: NavigationBubblesProps) {
  const maxIndex = Math.ceil(questions.length / 10) - 1;
  const currIndex = Math.floor((currentQuestionNumber - 1) / 10);
  const [wantedIndex, setWantedIndex] = useState(0);

  useEffect(() => {
    if (currentQuestionNumber > 10) {
      setWantedIndex(currIndex);
    } else {
      setWantedIndex(0);
    }
  }, [currentQuestionNumber]);

  function getCurrentBubbleIndex(wantedIndex: number = 0) {
    const bubbleArr: number[][] = [[]];
    let currentBubbleIndex = 0;

    for (let i = 0; i < questions.length; i++) {
      const isTenth = i % 10 === 0 && i !== 0;

      if (isTenth) {
        currentBubbleIndex++;
        bubbleArr[currentBubbleIndex] = [];
        bubbleArr[currentBubbleIndex].push(i + 1);
      } else {
        bubbleArr[currentBubbleIndex].push(i + 1);
      }
    }

    return bubbleArr[wantedIndex];
  }

  const bubblesArr = getCurrentBubbleIndex(wantedIndex);

  return (
    <>
      <Box display={"flex"} justifyContent={"center"}>
        <IconButton
          aria-label="previous question"
          icon={<ChevronLeftIcon />}
          m={"0.3em"}
          isDisabled={currentQuestionNumber === 1}
          onClick={() => {
            previousQuestion();
          }}
        />
        <IconButton
          aria-label="previous set of questions"
          icon={<ArrowLeftIcon />}
          m={"0.3em"}
          isDisabled={wantedIndex === 0}
          onClick={() => {
            setWantedIndex(wantedIndex - 1);
          }}
        />

        {bubblesArr.map((question_num) => (
          <Box
            key={question_num}
            onClick={() => {
              specificQuestion(question_num);
            }}
            className={`bottom-bubble-nav ${
              currentQuestionNumber === question_num ? "bubble-active" : ""
            } ${isAnswered(question_num) ? "bubble-answered" : ""}`}
          >
            <Text>{question_num.toString()}</Text>
          </Box>
        ))}
        <IconButton
          aria-label="next"
          icon={<ArrowRightIcon />}
          m={"0.3em"}
          isDisabled={maxIndex == wantedIndex}
          onClick={() => {
            setWantedIndex(wantedIndex + 1);
          }}
        />
        <IconButton
          aria-label="next question"
          icon={<ChevronRightIcon />}
          m={"0.3em"}
          isDisabled={currentQuestionNumber === questions.length}
          onClick={() => {
            nextQuestion();
          }}
        />
      </Box>
    </>
  );
}

function secondsToMMSS(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const minutesString = minutes.toString().padStart(2, "0");
  const secondsString = remainingSeconds.toString().padStart(2, "0");
  return `${minutesString}:${secondsString}`;
}